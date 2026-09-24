package core

import (
	"context"

	"github.com/sagernet/sing-box"
	"github.com/sagernet/sing-box/adapter"
	"github.com/sagernet/sing-box/adapter/certificate"
	"github.com/sagernet/sing-box/adapter/endpoint"
	"github.com/sagernet/sing-box/adapter/inbound"
	"github.com/sagernet/sing-box/adapter/outbound"
	"github.com/sagernet/sing-box/adapter/service"
	"github.com/sagernet/sing-box/dns"
	"github.com/sagernet/sing-box/dns/transport"
	"github.com/sagernet/sing-box/dns/transport/fakeip"
	"github.com/sagernet/sing-box/dns/transport/hosts"
	"github.com/sagernet/sing-box/dns/transport/local"
	"github.com/sagernet/sing-box/protocol/block"
	"github.com/sagernet/sing-box/protocol/direct"
	"github.com/sagernet/sing-box/protocol/hysteria2"
	"github.com/sagernet/sing-box/protocol/vless"
	originca "github.com/sagernet/sing-box/service/origin_ca"
	_ "github.com/sagernet/sing-box/transport/v2raywebsocket"
)

func Context(ctx context.Context) context.Context {
	return box.Context(
		ctx,
		Inbounds(),
		Outbounds(),
		Endpoints(),
		DNSTransports(),
		Services(),
		Certificates(),
	)
}

func Inbounds() *inbound.Registry {
	r := inbound.NewRegistry()
	direct.RegisterInbound(r)
	vless.RegisterInbound(r)
	hysteria2.RegisterInbound(r)
	return r
}

func Outbounds() *outbound.Registry {
	r := outbound.NewRegistry()
	direct.RegisterOutbound(r)
	block.RegisterOutbound(r)
	return r
}

func Endpoints() *endpoint.Registry {
	return endpoint.NewRegistry()
}

func DNSTransports() *dns.TransportRegistry {
	r := dns.NewTransportRegistry()
	transport.RegisterTCP(r)
	transport.RegisterUDP(r)
	hosts.RegisterTransport(r)
	local.RegisterTransport(r)
	fakeip.RegisterTransport(r)
	return r
}

func Services() *service.Registry {
	r := service.NewRegistry()
	hysteria2.RegisterRealmService(r)
	return r
}

func Certificates() *certificate.Registry {
	r := certificate.NewRegistry()
	originca.RegisterCertificateProvider(r)
	return r
}

var (
	_ = adapter.Inbound(nil)
	_ = certificate.Registry{}
)
