package main

import (
	"time"

	"github.com/urfave/cli/v2"

	cfdflags "github.com/cloudflare/cloudflared/cmd/cloudflared/flags"
	"github.com/cloudflare/cloudflared/cmd/cloudflared/updater"
	"github.com/cloudflare/cloudflared/ingress"
	"github.com/cloudflare/cloudflared/tlsconfig"
)

// envName derives the environment variable that backs a flag from the flag's
// own name, e.g. "no-autoupdate" becomes NICLINK_NO_AUTOUPDATE.
func envName(flagName string) string {
	out := make([]byte, 0, len(flagName)+len("NICLINK_"))
	out = append(out, "NICLINK_"...)
	for i := 0; i < len(flagName); i++ {
		c := flagName[i]
		switch {
		case c == '-':
			out = append(out, '_')
		case c >= 'a' && c <= 'z':
			out = append(out, c-'a'+'A')
		default:
			out = append(out, c)
		}
	}
	return string(out)
}

func envVars(flagName string) []string {
	return []string{envName(flagName)}
}

// linkFlags is the complete flag set owned by niclink. Every flag the runtime
// connection path reads must be registered here; names match the upstream
// runtime expectations, while usage text and environment variables are ours.
func linkFlags() []cli.Flag {
	return []cli.Flag{
		&cli.StringFlag{
			Name:    credFileFlag,
			Aliases: []string{credFileFlagAlias},
			Usage:   "Path to a credentials file for the link.",
			EnvVars: envVars(credFileFlag),
		},
		&cli.StringFlag{
			Name:    credContentsFlag,
			Usage:   "Credentials JSON contents; takes precedence over the credentials file.",
			EnvVars: envVars(credContentsFlag),
		},
		&cli.StringFlag{
			Name:    tokenFlag,
			Usage:   "Link token. Takes precedence over credentials and token-file.",
			EnvVars: envVars(tokenFlag),
		},
		&cli.StringFlag{
			Name:    tokenFileFlag,
			Usage:   "Path to a file containing the link token.",
			EnvVars: envVars(tokenFileFlag),
		},
		&cli.StringFlag{
			Name:    cfdflags.Protocol,
			Aliases: []string{"p"},
			Usage:   "Protocol used to connect to the edge.",
			Value:   "auto",
			EnvVars: envVars(cfdflags.Protocol),
		},
		&cli.BoolFlag{
			Name:    cfdflags.PostQuantum,
			Aliases: []string{"pq"},
			Usage:   "Use post-quantum cryptography when connecting.",
			EnvVars: envVars(cfdflags.PostQuantum),
		},
		&cli.StringSliceFlag{
			Name:    cfdflags.Features,
			Aliases: []string{"F"},
			Usage:   "Opt into under-development features.",
			EnvVars: envVars(cfdflags.Features),
		},
		&cli.StringFlag{
			Name:    cfdflags.Edge,
			Usage:   "Edge server address (internal testing only).",
			EnvVars: envVars(cfdflags.Edge),
		},
		&cli.StringFlag{
			Name:    cfdflags.Region,
			Usage:   "Edge region to connect to; empty selects the global region.",
			EnvVars: envVars(cfdflags.Region),
		},
		&cli.StringFlag{
			Name:    cfdflags.EdgeIpVersion,
			Usage:   "Edge IP version to connect with: 4, 6 or auto.",
			Value:   "auto",
			EnvVars: envVars(cfdflags.EdgeIpVersion),
		},
		&cli.StringFlag{
			Name:    cfdflags.EdgeBindAddress,
			Usage:   "Local IP address to bind outgoing edge connections to.",
			EnvVars: envVars(cfdflags.EdgeBindAddress),
		},
		&cli.StringFlag{
			Name:    cfdflags.CACert,
			Usage:   "CA certificate authenticating edge connections.",
			EnvVars: envVars(cfdflags.CACert),
		},
		&cli.StringFlag{
			Name:    cfdflags.Metrics,
			Usage:   "Listen address for metrics reporting.",
			EnvVars: envVars(cfdflags.Metrics),
		},
		&cli.DurationFlag{
			Name:    cfdflags.MetricsUpdateFreq,
			Usage:   "How often metrics are updated.",
			Value:   5 * time.Second,
			EnvVars: envVars(cfdflags.MetricsUpdateFreq),
		},
		&cli.DurationFlag{
			Name:    cfdflags.AutoUpdateFreq,
			Usage:   "How often to check for updates.",
			Value:   updater.DefaultCheckUpdateFreq,
			EnvVars: envVars(cfdflags.AutoUpdateFreq),
		},
		&cli.BoolFlag{
			Name:    cfdflags.NoAutoUpdate,
			Usage:   "Disable periodic update checks.",
			EnvVars: envVars(cfdflags.NoAutoUpdate),
		},
		&cli.BoolFlag{
			Name:    cfdflags.NoPrechecks,
			Usage:   "Skip connectivity pre-checks at startup.",
			EnvVars: envVars(cfdflags.NoPrechecks),
		},
		&cli.IntFlag{
			Name:    cfdflags.HaConnections,
			Usage:   "Number of edge connections to establish.",
			Value:   1,
			EnvVars: envVars(cfdflags.HaConnections),
		},
		&cli.IntFlag{
			Name:    cfdflags.Retries,
			Usage:   "Maximum retries for connection or protocol errors.",
			Value:   5,
			EnvVars: envVars(cfdflags.Retries),
		},
		&cli.IntFlag{
			Name:    cfdflags.MaxEdgeAddrRetries,
			Usage:   "Maximum retries on edge addresses before falling back to a lower protocol.",
			Value:   8,
			EnvVars: envVars(cfdflags.MaxEdgeAddrRetries),
		},
		&cli.DurationFlag{
			Name:    cfdflags.GracePeriod,
			Usage:   "How long to wait for in-flight requests during shutdown.",
			Value:   30 * time.Second,
			EnvVars: envVars(cfdflags.GracePeriod),
		},
		&cli.DurationFlag{
			Name:    cfdflags.RpcTimeout,
			Usage:   "How long to wait for an edge RPC.",
			Value:   5 * time.Second,
			EnvVars: envVars(cfdflags.RpcTimeout),
		},
		&cli.DurationFlag{
			Name:    cfdflags.WriteStreamTimeout,
			Usage:   "Write timeout when streaming toward the origin or edge (0 disables).",
			EnvVars: envVars(cfdflags.WriteStreamTimeout),
		},
		&cli.BoolFlag{
			Name:    cfdflags.QuicDisablePathMTUDiscovery,
			Usage:   "Disable QUIC path MTU discovery and use a smaller safe packet size.",
			EnvVars: envVars(cfdflags.QuicDisablePathMTUDiscovery),
		},
		&cli.IntFlag{
			Name:    cfdflags.QuicConnLevelFlowControlLimit,
			Usage:   "Connection-level flow control limit for QUIC.",
			Value:   30 * (1 << 20),
			EnvVars: envVars(cfdflags.QuicConnLevelFlowControlLimit),
		},
		&cli.IntFlag{
			Name:    cfdflags.QuicStreamLevelFlowControlLimit,
			Usage:   "Stream-level flow control limit for QUIC.",
			Value:   6 * (1 << 20),
			EnvVars: envVars(cfdflags.QuicStreamLevelFlowControlLimit),
		},
		&cli.StringFlag{
			Name:    cfdflags.ManagementHostname,
			Usage:   "Management hostname to signify incoming management requests",
			Value:   "management.argotunnel.com",
			EnvVars: envVars(cfdflags.ManagementHostname),
		},
		&cli.StringFlag{
			Name:    "service-op-ip",
			Usage:   "Fallback IP for service operations run by the management service.",
			Value:   "198.41.200.113:80",
			EnvVars: envVars("service-op-ip"),
		},
		&cli.BoolFlag{
			Name:    "management-diagnostics",
			Usage:   "Enables the in-depth diagnostic routes to be made available over the management service (/debug/pprof, /metrics, etc.)",
			EnvVars: envVars("management-diagnostics"),
		},
		&cli.StringFlag{
			Name:    cfdflags.LBPool,
			Usage:   "Name of the load balancing pool to add this origin to.",
			EnvVars: envVars(cfdflags.LBPool),
		},
		&cli.BoolFlag{
			Name:    cfdflags.IsAutoUpdated,
			Usage:   "Signal the new process that the connector has been autoupdated.",
			Value:   false,
			EnvVars: envVars(cfdflags.IsAutoUpdated),
		},
		&cli.StringFlag{
			Name:    cfdflags.ConnectorLabel,
			Usage:   "Label to identify this connector, defaults to the hostname.",
			EnvVars: envVars(cfdflags.ConnectorLabel),
		},
		&cli.StringSliceFlag{
			Name:    cfdflags.Tag,
			Usage:   "Custom KEY=VALUE tags forwarded to the origin.",
			EnvVars: envVars(cfdflags.Tag),
		},
		&cli.IntFlag{
			Name:    cfdflags.MaxActiveFlows,
			Usage:   "Maximum number of concurrent private network flows.",
			EnvVars: envVars(cfdflags.MaxActiveFlows),
		},
		&cli.StringSliceFlag{
			Name:    dnsResolverAddrsFlag,
			Usage:   "Override the dynamic DNS resolver with these address:port values.",
			EnvVars: envVars(dnsResolverAddrsFlag),
		},
		&cli.StringFlag{
			Name:    "url",
			Usage:   "Local service URL to expose.",
			Value:   "http://localhost:8080",
			EnvVars: envVars("url"),
		},
		&cli.BoolFlag{
			Name:    ingress.HelloWorldFlag,
			Usage:   "Expose a built-in hello world server.",
			EnvVars: envVars(ingress.HelloWorldFlag),
		},
		&cli.BoolFlag{
			Name:    ingress.NoTLSVerifyFlag,
			Usage:   "Skip TLS verification of the origin certificate.",
			EnvVars: envVars(ingress.NoTLSVerifyFlag),
		},
		&cli.BoolFlag{
			Name:    ingress.NoChunkedEncodingFlag,
			Usage:   "Disable chunked transfer encoding for the origin.",
			EnvVars: envVars(ingress.NoChunkedEncodingFlag),
		},
		&cli.BoolFlag{
			Name:    ingress.Http2OriginFlag,
			Usage:   "Enable HTTP/2 to the origin.",
			EnvVars: envVars(ingress.Http2OriginFlag),
		},
		&cli.StringFlag{
			Name:    ingress.HTTPHostHeaderFlag,
			Usage:   "Host header sent to the local service.",
			EnvVars: envVars(ingress.HTTPHostHeaderFlag),
		},
		&cli.StringFlag{
			Name:    ingress.OriginServerNameFlag,
			Usage:   "Hostname on the origin server certificate.",
			EnvVars: envVars(ingress.OriginServerNameFlag),
		},
		&cli.BoolFlag{
			Name:    ingress.MatchSNIToHostFlag,
			Usage:   "Match SNI to host header for the origin request.",
			EnvVars: envVars(ingress.MatchSNIToHostFlag),
		},
		&cli.StringFlag{
			Name:    tlsconfig.OriginCAPoolFlag,
			Usage:   "Path to the CA pool for the origin certificate.",
			EnvVars: envVars(tlsconfig.OriginCAPoolFlag),
		},
		&cli.StringFlag{
			Name:    "unix-socket",
			Usage:   "Unix socket to connect to instead of --url.",
			EnvVars: envVars("unix-socket"),
		},
		&cli.DurationFlag{
			Name:    ingress.ProxyConnectTimeoutFlag,
			Usage:   "Timeout for establishing a new origin connection.",
			Value:   30 * time.Second,
			EnvVars: envVars(ingress.ProxyConnectTimeoutFlag),
		},
		&cli.DurationFlag{
			Name:    ingress.ProxyTLSTimeoutFlag,
			Usage:   "Timeout for completing a TLS handshake with the origin.",
			Value:   10 * time.Second,
			EnvVars: envVars(ingress.ProxyTLSTimeoutFlag),
		},
		&cli.DurationFlag{
			Name:    ingress.ProxyTCPKeepAliveFlag,
			Usage:   "TCP keepalive duration for the origin connection.",
			Value:   30 * time.Second,
			EnvVars: envVars(ingress.ProxyTCPKeepAliveFlag),
		},
		&cli.DurationFlag{
			Name:    ingress.ProxyKeepAliveTimeoutFlag,
			Usage:   "Timeout for closing an idle origin connection.",
			Value:   90 * time.Second,
			EnvVars: envVars(ingress.ProxyKeepAliveTimeoutFlag),
		},
		&cli.IntFlag{
			Name:    ingress.ProxyKeepAliveConnectionsFlag,
			Usage:   "Maximum origin keepalive connection pool size.",
			Value:   100,
			EnvVars: envVars(ingress.ProxyKeepAliveConnectionsFlag),
		},
		&cli.BoolFlag{
			Name:    ingress.ProxyNoHappyEyeballsFlag,
			Usage:   "Disable happy eyeballs for IPv4/IPv6 fallback to the origin.",
			EnvVars: envVars(ingress.ProxyNoHappyEyeballsFlag),
		},
		&cli.BoolFlag{
			Name:    ingress.Socks5Flag,
			Usage:   "Run as a SOCKS5 proxy for the origin.",
			EnvVars: envVars(ingress.Socks5Flag),
		},
		&cli.BoolFlag{
			Name:    ingress.SSHServerFlag,
			Usage:   "Run an SSH Server.",
			Value:   false,
			EnvVars: envVars(ingress.SSHServerFlag),
		},
		&cli.BoolFlag{
			Name:    "bastion",
			Usage:   "Runs as jump host.",
			Value:   false,
			EnvVars: envVars("bastion"),
		},
		&cli.StringFlag{
			Name:    ingress.ProxyAddressFlag,
			Usage:   "Listen address for the proxy.",
			Value:   "127.0.0.1",
			EnvVars: envVars(ingress.ProxyAddressFlag),
		},
		&cli.IntFlag{
			Name:    ingress.ProxyPortFlag,
			Usage:   "Listen port for the proxy.",
			Value:   0,
			EnvVars: envVars(ingress.ProxyPortFlag),
		},
		&cli.StringFlag{
			Name:    "hostname",
			Usage:   "Hostname to route through the link.",
			EnvVars: envVars("hostname"),
		},
		&cli.StringFlag{
			Name:    "name",
			Aliases: []string{"n"},
			Usage:   "Stable name for the link.",
			EnvVars: envVars("name"),
		},
		&cli.StringFlag{
			Name:    "config",
			Usage:   "Path to a YAML configuration file.",
			EnvVars: envVars("config"),
		},
		&cli.StringFlag{
			Name:    cfdflags.OriginCert,
			Usage:   "Path to the origin certificate.",
			EnvVars: envVars(cfdflags.OriginCert),
		},
		&cli.StringFlag{
			Name:    cfdflags.ApiURL,
			Usage:   "Base URL for the edge API.",
			Value:   "https://api.cloudflare.com/client/v4",
			EnvVars: envVars(cfdflags.ApiURL),
		},
		&cli.StringFlag{
			Name:    cfdflags.LogLevel,
			Usage:   "Application log level: debug, info, warn, error or fatal.",
			Value:   "info",
			EnvVars: envVars(cfdflags.LogLevel),
		},
		&cli.StringFlag{
			Name:    cfdflags.LogFile,
			Usage:   "Write application logs to this file.",
			EnvVars: envVars(cfdflags.LogFile),
		},
		&cli.StringFlag{
			Name:    cfdflags.LogDirectory,
			Usage:   "Write application logs to this directory.",
			EnvVars: envVars(cfdflags.LogDirectory),
		},
		&cli.StringFlag{
			Name:    cfdflags.TraceOutput,
			Usage:   "Name of the trace output file written on shutdown.",
			EnvVars: envVars(cfdflags.TraceOutput),
		},
		&cli.StringFlag{
			Name:    cfdflags.LogFormatOutput,
			Usage:   "Log output format: default or json.",
			Value:   cfdflags.LogFormatOutputValueDefault,
			EnvVars: envVars(cfdflags.LogFormatOutput),
		},
		&cli.StringFlag{
			Name:    "pidfile",
			Usage:   "Write the process ID to this file after the first connection.",
			EnvVars: envVars("pidfile"),
		},
		&cli.StringSliceFlag{
			Name:    "proxy-dns-upstream",
			Usage:   "Upstream DNS servers for the built-in DNS proxy.",
			EnvVars: envVars("proxy-dns-upstream"),
		},
		&cli.StringFlag{
			Name:    "proxy-dns-address",
			Usage:   "Listen address for the built-in DNS proxy.",
			EnvVars: envVars("proxy-dns-address"),
		},
	}
}
