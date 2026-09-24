package main

import (
	"context"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/sagernet/sing-box"
	"github.com/sagernet/sing-box/log"
	"github.com/sagernet/sing-box/option"
	"github.com/sagernet/sing/common"
	"github.com/sagernet/sing/common/json"
	"github.com/sagernet/sing/service"

	"nic/core"

	"github.com/spf13/cobra"
)

var (
	globalCtx   context.Context
	configPaths []string
)

var mainCommand = &cobra.Command{
	Use: "niccore",
}

var commandRun = &cobra.Command{
	Use:   "run",
	Short: "Run service",
	Run: func(cmd *cobra.Command, args []string) {
		if err := run(); err != nil {
			log.Fatal(err)
		}
	},
}

func init() {
	mainCommand.PersistentFlags().StringArrayVarP(&configPaths, "config", "c", nil, "set configuration file path")
	mainCommand.AddCommand(commandRun)
	mainCommand.PersistentPreRun = preRun
}

func preRun(cmd *cobra.Command, args []string) {
	globalCtx = context.Background()
	if len(configPaths) == 0 {
		configPaths = append(configPaths, "config.json")
	}
	globalCtx = core.Context(service.ContextWith(globalCtx, log.StdLogger()))
}

func readConfig() (option.Options, error) {
	var options option.Options
	for _, path := range configPaths {
		content, err := os.ReadFile(path)
		if err != nil {
			return option.Options{}, err
		}
		options, err = json.UnmarshalExtendedContext[option.Options](globalCtx, content)
		if err != nil {
			return option.Options{}, err
		}
	}
	return options, nil
}

func run() error {
	options, err := readConfig()
	if err != nil {
		return err
	}
	ctx, cancel := context.WithCancel(service.ExtendContext(globalCtx))
	instance, err := box.New(box.Options{Context: ctx, Options: options})
	if err != nil {
		cancel()
		return err
	}
	if err := instance.Start(); err != nil {
		cancel()
		return err
	}
	osSignals := make(chan os.Signal, 1)
	signal.Notify(osSignals, os.Interrupt, syscall.SIGTERM)
	defer signal.Stop(osSignals)
	<-osSignals
	cancel()
	closeCtx, closed := context.WithCancel(context.Background())
	go func() {
		time.Sleep(30 * time.Second)
		select {
		case <-closeCtx.Done():
		default:
			log.Fatal("did not close!")
		}
	}()
	err = instance.Close()
	closed()
	return err
}

func main() {
	if err := mainCommand.Execute(); err != nil {
		common.Must1(os.Stderr.WriteString(err.Error() + "\n"))
		os.Exit(1)
	}
}
