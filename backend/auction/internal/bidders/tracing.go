package bidders

import (
	"context"
)

// Span represents an in-flight tracing span.
// Implementations should be lightweight and safe to call from hot paths.
type Span interface {
	// End marks the span as completed.
	End()
	// SetAttr sets a string attribute on the span.
	SetAttr(key, val string)
}

// Tracer starts spans. Real implementations may attach spans to contexts.
type Tracer interface {
	StartSpan(ctx context.Context, name string, attrs map[string]string) (context.Context, Span)
}

// --- No-op default tracer/span ---

type noopSpan struct{}

func (noopSpan) End()                    {}
func (noopSpan) SetAttr(key, val string) {}

type noopTracer struct{}

func (noopTracer) StartSpan(ctx context.Context, name string, attrs map[string]string) (context.Context, Span) {
	return ctx, noopSpan{}
}

var globalTracer Tracer = noopTracer{}

// SetTracer allows the host to install a custom tracer implementation.
// Passing nil keeps the existing tracer.
func SetTracer(t Tracer) {
	if t != nil {
		globalTracer = t
	}
}

// StartSpan is a convenience helper to start a span using the global tracer.
func StartSpan(ctx context.Context, name string, attrs map[string]string) (context.Context, Span) {
	return globalTracer.StartSpan(ctx, name, attrs)
}
