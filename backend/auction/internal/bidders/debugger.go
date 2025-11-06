package bidders

import (
	"sync"
	"time"
)

// DebugEvent is a sanitized, lightweight record of a single adapter call for the Mediation Debugger.
// It must not contain PII or raw secrets. Payload fields should be pre-redacted and truncated.
// This type intentionally uses only primitive types and maps for easy JSON marshalling by callers.
type DebugEvent struct {
	PlacementID string            `json:"placement_id"`
	RequestID   string            `json:"request_id"`
	Adapter     string            `json:"adapter"`
	Outcome     string            `json:"outcome"` // success | no_bid
	Reason      string            `json:"reason,omitempty"`
	TimingsMS   map[string]float64 `json:"timings_ms,omitempty"` // e.g. {"total": 42, "http": 37}
	ReqSummary  map[string]any    `json:"req_summary,omitempty"`
	RespSummary map[string]any    `json:"resp_summary,omitempty"`
	CreatedAt   time.Time         `json:"created_at"`
}

// Debugger is the interface for capturing adapter call events for a short-lived, in-memory debugger.
// Implementations must be fast and non-blocking; heavy lifting should be avoided on hot paths.
type Debugger interface {
	// Capture ingests a debug event. Implementations should apply local ring buffering and TTL.
	Capture(ev DebugEvent)
	// GetLast returns up to N most recent events for a placement (or all if placementID is empty).
	GetLast(placementID string, n int) []DebugEvent
}

// noopDebugger is the default; does nothing to avoid overhead unless explicitly enabled.
type noopDebugger struct{}

func (noopDebugger) Capture(DebugEvent)                 {}
func (noopDebugger) GetLast(string, int) []DebugEvent { return nil }

var globalDebugger Debugger = noopDebugger{}

// SetDebugger allows the host app/tests to install a debugger implementation.
// Passing nil keeps the existing debugger.
func SetDebugger(d Debugger) {
	if d != nil {
		globalDebugger = d
	}
}

// CaptureDebugEvent forwards a sanitized event to the configured debugger (if any).
// Adapters may call this at the end of their RequestBid to record a summary for the Mediation Debugger.
func CaptureDebugEvent(ev DebugEvent) { globalDebugger.Capture(ev) }

// GetLastDebugEvents exposes the last N events for a placement from the configured debugger (read-only).
// If placementID is empty, returns events stored under the unknown bucket.
func GetLastDebugEvents(placementID string, n int) []DebugEvent { return globalDebugger.GetLast(placementID, n) }

// InMemoryDebugger is a lightweight ring-buffer implementation keyed by placement ID.
// It stores only the most recent events per placement to bound memory usage.
type InMemoryDebugger struct {
	mu              sync.Mutex
	perPlacementCap int
	// placement -> events (newest at end)
	store map[string][]DebugEvent
}

// NewInMemoryDebugger creates a new debugger with a per-placement ring buffer capacity.
// If cap <= 0, defaults to 100.
func NewInMemoryDebugger(perPlacementCap int) *InMemoryDebugger {
	if perPlacementCap <= 0 {
		perPlacementCap = 100
	}
	return &InMemoryDebugger{perPlacementCap: perPlacementCap, store: make(map[string][]DebugEvent)}
}

func (d *InMemoryDebugger) Capture(ev DebugEvent) {
	if ev.CreatedAt.IsZero() {
		ev.CreatedAt = time.Now()
	}
	key := ev.PlacementID
	if key == "" {
		key = "__unknown__"
	}
	d.mu.Lock()
	defer d.mu.Unlock()
	buf := append(d.store[key], ev)
	// Enforce ring buffer capacity
	if len(buf) > d.perPlacementCap {
		buf = buf[len(buf)-d.perPlacementCap:]
	}
	d.store[key] = buf
}

func (d *InMemoryDebugger) GetLast(placementID string, n int) []DebugEvent {
	d.mu.Lock()
	defer d.mu.Unlock()
	key := placementID
	if key == "" {
		key = "__unknown__"
	}
	buf := d.store[key]
	if n <= 0 || n >= len(buf) {
		// return a copy to avoid external mutation
		out := make([]DebugEvent, len(buf))
		copy(out, buf)
		return out
	}
	out := make([]DebugEvent, n)
	copy(out, buf[len(buf)-n:])
	return out
}

// RedactForDebugger applies best-effort redaction/truncation for payload maps.
// - Masks values for keys that look like secrets ("key", "token", "secret", "authorization").
// - Truncates long strings to maxLen (keeping head/tail with ellipsis) to avoid large payloads.
// - Removes obviously sensitive fields like IPs and full User-Agent if redactPII is true.
func RedactForDebugger(m map[string]any, maxLen int, redactPII bool) map[string]any {
	if m == nil {
		return nil
	}
	if maxLen <= 0 {
		maxLen = 256
	}
	out := make(map[string]any, len(m))
	for k, v := range m {
		lk := lower(k)
		switch lk {
		case "authorization", "auth", "token", "access_token", "secret", "sdk_key", "api_key", "app_key":
			if s, ok := v.(string); ok {
				out[k] = maskKey(s)
				continue
			}
		}
		if redactPII {
			if lk == "ip" || lk == "user_agent" || lk == "ua" || lk == "ifa" || lk == "advertisingid" {
				continue // drop PII-like fields
			}
		}
		// Truncate long strings
		if s, ok := v.(string); ok {
			out[k] = truncateMiddle(s, maxLen)
			continue
		}
		out[k] = v
	}
	return out
}

func truncateMiddle(s string, max int) string {
	if len(s) <= max {
		return s
	}
	if max < 8 {
		return s[:max]
	}
	head := max/2 - 3
	tail := max - head - 3
	return s[:head] + "..." + s[len(s)-tail:]
}

func lower(s string) string {
	bs := []byte(s)
	for i := 0; i < len(bs); i++ {
		c := bs[i]
		if c >= 'A' && c <= 'Z' {
			bs[i] = c + 32
		}
	}
	return string(bs)
}
