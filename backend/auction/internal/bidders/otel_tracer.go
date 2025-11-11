package bidders

import (
	"context"
	"os"
	"strings"

	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracehttp"
	"go.opentelemetry.io/otel/sdk/resource"
	"go.opentelemetry.io/otel/sdk/trace"
	oteltrace "go.opentelemetry.io/otel/trace"
)

// otelSpan wraps an OpenTelemetry span to implement our Span interface and expose IDs.
type otelSpan struct { s oteltrace.Span }

func (o *otelSpan) End() { o.s.End() }
func (o *otelSpan) SetAttr(key, val string) { o.s.SetAttributes(attribute.String(key, val)) }
func (o *otelSpan) SetAttributes(attrs map[string]string) {
	if len(attrs) == 0 { return }
	kv := make([]attribute.KeyValue, 0, len(attrs))
	for k, v := range attrs { kv = append(kv, attribute.String(k, v)) }
	o.s.SetAttributes(kv...)
}

// TraceAndSpanIDs returns trace_id and span_id (hex) if the span is from our otel wrapper; otherwise empty strings.
func TraceAndSpanIDs(sp Span) (traceID, spanID string) {
	if sp == nil { return "", "" }
	if os, ok := sp.(*otelSpan); ok && os.s != nil {
		ctx := os.s.SpanContext()
		if ctx.HasTraceID() {
			traceID = ctx.TraceID().String()
		}
		if ctx.HasSpanID() {
			spanID = ctx.SpanID().String()
		}
	}
	return
}

// otelTracer implements Tracer backed by OpenTelemetry SDK.
type otelTracer struct { tp *trace.TracerProvider; tr oteltrace.Tracer }

func (t *otelTracer) StartSpan(ctx context.Context, name string, attrs map[string]string) (context.Context, Span) {
	// Map initial attributes
	opts := []oteltrace.SpanStartOption{}
	if len(attrs) > 0 {
		kv := make([]attribute.KeyValue, 0, len(attrs))
		for k, v := range attrs { kv = append(kv, attribute.String(k, v)) }
		opts = append(opts, oteltrace.WithAttributes(kv...))
	}
	ctx, sp := t.tr.Start(ctx, name, opts...)
	return ctx, &otelSpan{s: sp}
}

// InstallOTelTracer installs an OTLP HTTP tracer if the endpoint env var is set. Returns true if installed.
// Env:
//   OTEL_EXPORTER_OTLP_ENDPOINT — e.g., http://localhost:4318
//   OTEL_SERVICE_NAME — optional; default "auction"
//   OTEL_RESOURCE_ATTRIBUTES — optional; comma-separated k=v pairs
func InstallOTelTracer() bool {
	endpoint := strings.TrimSpace(os.Getenv("OTEL_EXPORTER_OTLP_ENDPOINT"))
	if endpoint == "" { return false }

	exp, err := otlptracehttp.New(context.Background(), otlptracehttp.WithEndpoint(endpoint), otlptracehttp.WithInsecure())
	if err != nil { return false }

	serviceName := strings.TrimSpace(os.Getenv("OTEL_SERVICE_NAME"))
	if serviceName == "" { serviceName = "auction" }

	attrs := []attribute.KeyValue{ attribute.String("service.name", serviceName) }
	if ra := strings.TrimSpace(os.Getenv("OTEL_RESOURCE_ATTRIBUTES")); ra != "" {
		for _, part := range strings.Split(ra, ",") {
			kv := strings.SplitN(strings.TrimSpace(part), "=", 2)
			if len(kv) == 2 && kv[0] != "" { attrs = append(attrs, attribute.String(kv[0], kv[1])) }
		}
	}
 res, _ := resource.Merge(resource.Default(), resource.NewWithAttributes("", attrs...))
	tp := trace.NewTracerProvider(trace.WithBatcher(exp), trace.WithResource(res))
	otel.SetTracerProvider(tp)

	// Install into our bidders tracer bridge
	SetTracer(&otelTracer{tp: tp, tr: otel.Tracer(serviceName)})
	return true }
