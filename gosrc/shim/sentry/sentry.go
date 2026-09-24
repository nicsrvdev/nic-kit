// Local no-op stand-in for getsentry/sentry-go.
//
// Only the symbols referenced by the link run path are provided.
// All reporting calls are discarded; Init always succeeds.
package sentry

import (
	"context"
	"time"
)

type EventID string

type ClientOptions struct {
	Dsn     string
	Release string
}

type Hub struct{}

func Init(ClientOptions) error { return nil }

func CaptureException(error) *EventID { return nil }

func CurrentHub() *Hub { return &Hub{} }

func Flush(time.Duration) bool { return true }

func Recover() *EventID { return nil }

func RecoverWithContext(context.Context) *EventID { return nil }

func (h *Hub) Clone() *Hub { return &Hub{} }

func (h *Hub) CaptureException(error) *EventID { return nil }

func (h *Hub) Recover(interface{}) *EventID { return nil }

func (h *Hub) RecoverWithContext(context.Context, interface{}) *EventID { return nil }
