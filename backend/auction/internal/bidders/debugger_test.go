package bidders

import (
	"testing"
	"time"
)

func TestInMemoryDebugger_RingBufferCapacity(t *testing.T) {
	d := NewInMemoryDebugger(3)
	placement := "pl-1"
	// Insert 5 events; capacity 3 should keep only last 3
	for i := 0; i < 5; i++ {
		CaptureDebugEvent(DebugEvent{ // via global, but default is noop; use direct impl instead
			PlacementID: placement,
			RequestID:   "r-" + string(rune('a'+i)),
			Adapter:     "test",
			Outcome:     "no_bid",
			Reason:      "status_500",
			CreatedAt:   time.Unix(1, 0).Add(time.Duration(i) * time.Second),
		})
	}
	// Above used global noop; instead, capture via direct instance
	d.Capture(DebugEvent{PlacementID: placement, RequestID: "r-a", Adapter: "t", Outcome: "no_bid", CreatedAt: time.Unix(1, 0)})
	d.Capture(DebugEvent{PlacementID: placement, RequestID: "r-b", Adapter: "t", Outcome: "no_bid", CreatedAt: time.Unix(2, 0)})
	d.Capture(DebugEvent{PlacementID: placement, RequestID: "r-c", Adapter: "t", Outcome: "no_bid", CreatedAt: time.Unix(3, 0)})
	d.Capture(DebugEvent{PlacementID: placement, RequestID: "r-d", Adapter: "t", Outcome: "success", CreatedAt: time.Unix(4, 0)})

events := d.GetLast(placement, 10)
	if len(events) != 3 {
		t.Fatalf("expected 3 events retained, got %d", len(events))
	}
	if events[0].RequestID != "r-b" || events[2].RequestID != "r-d" {
		t.Fatalf("unexpected ring buffer order: %+v", events)
	}
}

func TestRedactForDebugger(t *testing.T) {
	m := map[string]any{
		"api_key":   "abcd1234ef",
		"token":     "tok-XYZ-9999",
		"ip":        "192.168.1.1",
		"user_agent": "Mozilla/5.0 (X; Y; Z)",
		"note":      "this is a long string that should be truncated in the middle to avoid huge payload sizes for the debugger view",
		"ok":        123,
	}
	red := RedactForDebugger(m, 40, true)
	if _, ok := red["ip"]; ok {
		t.Fatalf("expected IP to be removed when redactPII=true")
	}
	if _, ok := red["user_agent"]; ok {
		t.Fatalf("expected user_agent to be removed when redactPII=true")
	}
	if v, ok := red["api_key"].(string); !ok || v == m["api_key"].(string) || len(v) >= len(m["api_key"].(string)) {
		t.Fatalf("expected api_key to be masked, got %v", v)
	}
	if v, ok := red["note"].(string); !ok || len(v) >= 60 || v == m["note"].(string) {
		t.Fatalf("expected note to be truncated, got %v", v)
	}
	if red["ok"].(int) != 123 {
		t.Fatalf("expected numeric fields to pass through")
	}
}
