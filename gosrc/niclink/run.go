package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/pkg/errors"
	"github.com/urfave/cli/v2"

	"github.com/cloudflare/cloudflared/cmd/cloudflared/cliutil"
	"github.com/cloudflare/cloudflared/cmd/cloudflared/tunnel"
	"github.com/cloudflare/cloudflared/connection"
	"github.com/cloudflare/cloudflared/logger"
)

// Flag names owned by niclink.
const (
	credFileFlag         = "credentials-file"
	credFileFlagAlias    = "cred-file"
	credContentsFlag     = "credentials-contents"
	tokenFlag            = "token"
	tokenFileFlag        = "token-file"
	dnsResolverAddrsFlag = "dns-resolver-addresses"
	protocolFlag         = "protocol"
)

const quickEndpoint = "https://api.trycloudflare.com"

// runAction resolves the link credentials and starts the connection. It backs
// both `niclink run` (token mode) and the top-level quick invocation.
func runAction(c *cli.Context) error {
	if c.NArg() > 1 {
		return cliutil.UsageError("niclink run accepts at most one argument, the link name or ID.")
	}

	if token := c.String(tokenFlag); token != "" {
		return runWithToken(c, token)
	}
	if tokenFile := c.String(tokenFileFlag); tokenFile != "" {
		data, err := os.ReadFile(tokenFile)
		if err != nil {
			return cliutil.UsageError("Failed to read token file: %s", err.Error())
		}
		return runWithToken(c, strings.TrimSpace(string(data)))
	}

	if c.IsSet("url") || c.IsSet("hello-world") {
		return runQuickLink(c)
	}

	return cliutil.UsageError("niclink requires a token, a token file, or --url for a quick link.")
}

func runWithToken(c *cli.Context, tokenStr string) error {
	token, err := tunnel.ParseToken(tokenStr)
	if err != nil {
		return cliutil.UsageError("Provided link token is not valid.")
	}
	return startLink(c, &connection.TunnelProperties{Credentials: token.Credentials()})
}

// runQuickLink provisions an ephemeral public hostname and connects to it,
// mirroring quick-link behavior without depending on the upstream CLI layer.
func runQuickLink(c *cli.Context) error {
	log := logger.CreateLoggerFromContext(c, logger.EnableTerminalLog)
	log.Info().Msg(quickDisclaimer)
	log.Info().Msg("Requesting a new quick link on trycloudflare.com...")

	client := http.Client{
		Transport: &http.Transport{
			TLSHandshakeTimeout:   15 * time.Second,
			ResponseHeaderTimeout: 15 * time.Second,
		},
		Timeout: 15 * time.Second,
	}

	req, err := http.NewRequest(http.MethodPost, quickEndpoint+"/tunnel", bytes.NewReader(nil))
	if err != nil {
		return errors.Wrap(err, "failed to build quick link request")
	}
	req.Header.Add("Content-Type", "application/json")
	req.Header.Add("User-Agent", buildInfo.UserAgent())

	resp, err := client.Do(req)
	if err != nil {
		return errors.Wrap(err, "failed to request quick link")
	}
	defer func() { _ = resp.Body.Close() }()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return errors.Wrap(err, "failed to read quick link response")
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("quick link provisioning failed with status %d: %s", resp.StatusCode, string(respBody))
	}

	var data quickLinkResponse
	if err := json.Unmarshal(respBody, &data); err != nil {
		return errors.Wrap(err, "failed to unmarshal quick link response")
	}
	if len(data.Errors) > 0 {
		msgs := make([]string, 0, len(data.Errors))
		for _, e := range data.Errors {
			msgs = append(msgs, fmt.Sprintf("[%d] %s", e.Code, e.Message))
		}
		return fmt.Errorf("quick link provisioning failed: %s", strings.Join(msgs, "; "))
	}
	if !data.Success {
		return errors.New("quick link provisioning failed")
	}

	linkID, err := uuid.Parse(data.Result.ID)
	if err != nil {
		return errors.Wrap(err, "failed to parse quick link ID")
	}

	hostname := data.Result.Hostname
	displayURL := hostname
	if !strings.HasPrefix(displayURL, "https://") {
		displayURL = "https://" + displayURL
	}

	cliutil.LogTable(log, []string{
		"Your quick link has been created! Visit it at (it may take some time to be reachable):",
		displayURL,
	})

	if !c.IsSet(protocolFlag) {
		_ = c.Set(protocolFlag, "quic")
	}

	return startLink(c, &connection.TunnelProperties{
		Credentials: connection.Credentials{
			AccountTag:   data.Result.AccountTag,
			TunnelSecret: data.Result.Secret,
			TunnelID:     linkID,
		},
		QuickTunnelUrl: hostname,
	})
}

func startLink(c *cli.Context, props *connection.TunnelProperties) error {
	log := logger.CreateLoggerFromContext(c, logger.EnableTerminalLog)
	return tunnel.StartServer(c, buildInfo, props, log)
}

type quickLinkResponse struct {
	Success bool
	Result  struct {
		ID         string `json:"id"`
		Name       string `json:"name"`
		Hostname   string `json:"hostname"`
		AccountTag string `json:"account_tag"`
		Secret     []byte `json:"secret"`
	}
	Errors []struct {
		Code    int
		Message string
	}
}

const quickDisclaimer = "This is an ephemeral link without an account: it has no uptime guarantee and is subject to the provider's terms of use. For production, use a pre-created named link."
