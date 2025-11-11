package bidders

import (
	"context"
	"testing"
)

type testSpan struct{ attrs map[string]string; ended bool }

func (s *testSpan) End() { s.ended = true }
func (s *testSpan) SetAttr(k, v string) { if s.attrs == nil { s.attrs = map[string]string{} }; s.attrs[k] = v }
func (s *testSpan) SetAttributes(attrs map[string]string) {
	if s.attrs == nil { s.attrs = map[string]string{} }
	for k, v := range attrs { s.attrs[k] = v }
}

type testTracer struct{ started bool; lastName string; lastAttrs map[string]string }

func (t *testTracer) StartSpan(ctx context.Context, name string, attrs map[string]string) (context.Context, Span) {
	t.started = true
	t.lastName = name
	t.lastAttrs = attrs
	return ctx, &testSpan{attrs: map[string]string{"adapter": attrs["adapter"]}}
}

func TestTracing_StartSpanAndAttributes(t *testing.T) {
	tr := &testTracer{}
	SetTracer(tr)

	ctx := context.Background()
	ctx, sp := StartSpan(ctx, "adapter.request", map[string]string{"adapter": "admob"})
	_ = ctx
	if !tr.started || tr.lastName != "adapter.request" {
		t.Fatalf("expected tracer to start span with correct name")
	}

	sp.SetAttr("outcome", "success")
	sp.End()
	// best-effort: ensure interface methods are callable; behavior validated via tracer flags
}
