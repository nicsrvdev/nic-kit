package main

import (
	"fmt"
	"os"
	"os/signal"
	"syscall"

	"github.com/urfave/cli/v2"

	"github.com/cloudflare/cloudflared/cmd/cloudflared/cliutil"
	"github.com/cloudflare/cloudflared/cmd/cloudflared/tunnel"
)

var (
	// Version 默认 dev：正式构建由 -ldflags "-X main.Version=<tag>" 注入（见 release workflow / Dockerfile）
	Version   = "dev"
	BuildTime = "unknown"
	BuildType = ""

	buildInfo *cliutil.BuildInfo
)

func main() {
	os.Setenv("QUIC_GO_DISABLE_ECN", "1")

	buildInfo = cliutil.GetBuildInfo(BuildType, Version)

	cli.VersionFlag = &cli.BoolFlag{
		Name:    "version",
		Aliases: []string{"v", "V"},
		Usage:   "Print the version",
	}

	app := &cli.App{
		Name:            "niclink",
		Usage:           "Minimal link client",
		UsageText:       "niclink [global options] command [command options]",
		Version:         fmt.Sprintf("%s (built %s)", Version, BuildTime),
		Flags:           linkFlags(),
		HideHelpCommand: true,
		Commands: []*cli.Command{
			{
				Name:   "run",
				Usage:  "Run a link using a token or credentials",
				Action: cliutil.ConfiguredAction(runAction),
				Flags:  linkFlags(),
			},
		},
	}

	// No token/url-specified invocation runs quick mode through the same action.
	app.Action = cliutil.ConfiguredAction(runAction)

	// 优雅关闭：SIGTERM/SIGINT 时关闭 graceShutdownC，通知 tunnel 做 graceful drain，
	// 而不是像之前那样传一个永远没人 close 的匿名 channel 导致进程被硬杀
	graceShutdownC := make(chan struct{})
	sigC := make(chan os.Signal, 1)
	signal.Notify(sigC, os.Interrupt, syscall.SIGTERM)
	go func() {
		<-sigC
		signal.Stop(sigC)
		close(graceShutdownC)
	}()

	tunnel.Init(buildInfo, graceShutdownC)
	runApp(app)
}

func runApp(app *cli.App) {
	cli.VersionPrinter = func(c *cli.Context) {
		fmt.Fprintf(c.App.Writer, "%s\n", c.App.Version)
	}
	if err := app.Run(os.Args); err != nil {
		_, _ = fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
