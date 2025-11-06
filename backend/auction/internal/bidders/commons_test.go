package bidders

import (
	"context"
	"errors"
	"testing"
)

// fakeNetError implements net.Error for testing
type fakeNetError struct{ timeout bool }

func (e fakeNetError) Error() string   { return "fake net error" }
func (e fakeNetError) Timeout() bool   { return e.timeout }
func (e fakeNetError) Temporary() bool { return true }

func TestIsTransient(t *testing.T) {
	// Context deadline exceeded
	if !IsTransient(context.DeadlineExceeded) {
		t.Errorf("expected DeadlineExceeded to be transient")
	}
	// Context canceled
	if !IsTransient(context.Canceled) {
		t.Errorf("expected Canceled to be transient")
	}
	// net.Error timeout
	if !IsTransient(fakeNetError{timeout: true}) {
		t.Errorf("expected net.Error timeout to be transient")
	}
	// Encoded 5xx status should be transient
	if !IsTransient(errors.New("status_500")) {
		t.Errorf("expected status_500 to be transient")
	}
	// Encoded 4xx status should NOT be transient
	if IsTransient(errors.New("status_404")) {
		t.Errorf("did not expect status_404 to be transient")
	}
	// Generic error should not be transient
	if IsTransient(errors.New("some error")) {
		t.Errorf("did not expect generic error to be transient")
	}
}

func TestMapErrorToNoBid(t *testing.T) {
	cases := []struct {
		name string
		in   error
		out  string
	}{
		{"nil_error", nil, "unknown"},
		{"deadline", context.DeadlineExceeded, NoBidTimeout},
		{"canceled", context.Canceled, NoBidTimeout},
		{"net_timeout", fakeNetError{timeout: true}, NoBidTimeout},
		{"status_passthrough", errors.New("status_503"), "status_503"},
		{"no_fill", errors.New("no_fill"), NoBidNoFill},
		{"generic", errors.New("whatever"), NoBidError},
	}
	for _, tc := range cases {
		if got := MapErrorToNoBid(tc.in); got != tc.out {
			t.Errorf("%s: expected %q, got %q", tc.name, tc.out, got)
		}
	}
}
