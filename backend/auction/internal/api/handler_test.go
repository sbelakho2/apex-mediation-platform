package api

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gorilla/mux"

	"github.com/rivalapexmediation/auction/internal/bidders"
)

type jsonResp map[string]any

// setUpRouter wires only the handlers we are testing (read-only Admin APIs)
func setUpRouter() *mux.Router {
	// Wire in-memory observability components like main.go (but with small capacities)
	bidders.SetDebugger(bidders.NewInMemoryDebugger(50))
	bidders.SetMetricsRecorder(bidders.NewRollingMetricsRecorder(128))
	bidders.SetTimeSeriesAggregator(bidders.NewTimeSeriesAggregator(1*time.Minute, 1*time.Hour))

	h := NewHandlers(nil, nil)
	r := mux.NewRouter()
	r.HandleFunc("/v1/metrics/adapters", h.GetAdapterMetrics).Methods("GET")
	r.HandleFunc("/v1/metrics/adapters/timeseries", h.GetAdapterMetricsTimeSeries).Methods("GET")
	r.HandleFunc("/v1/metrics/slo", h.GetAdapterSLO).Methods("GET")
	r.HandleFunc("/v1/debug/mediation", h.GetMediationDebugEvents).Methods("GET")
	r.HandleFunc("/v1/metrics/overview", h.GetObservabilitySnapshot).Methods("GET")
	return r
}

func TestAdminHandlers_MetricsSnapshot_OK(t *testing.T) {
	r := setUpRouter()
	req := httptest.NewRequest(http.MethodGet, "/v1/metrics/adapters", nil)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
	var out jsonResp
	if err := json.Unmarshal(rec.Body.Bytes(), &out); err != nil {
		t.Fatalf("invalid JSON: %v", err)
	}
	if ok, _ := out["success"].(bool); !ok {
		t.Fatalf("expected success=true in response")
	}
}

func TestAdminHandlers_TimeSeries_OK(t *testing.T) {
	r := setUpRouter()
	req := httptest.NewRequest(http.MethodGet, "/v1/metrics/adapters/timeseries?days=7", nil)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
	var out jsonResp
	_ = json.Unmarshal(rec.Body.Bytes(), &out)
	if ok, _ := out["success"].(bool); !ok {
		t.Fatalf("expected success=true in response")
	}
}

func TestAdminHandlers_SLO_OK(t *testing.T) {
	r := setUpRouter()
	req := httptest.NewRequest(http.MethodGet, "/v1/metrics/slo", nil)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
	var out jsonResp
	if err := json.Unmarshal(rec.Body.Bytes(), &out); err != nil {
		t.Fatalf("invalid JSON: %v", err)
	}
	data, _ := out["data"].(map[string]any)
	if data == nil || data["window_1h"] == nil || data["window_24h"] == nil {
		t.Fatalf("expected window_1h and window_24h in data")
	}
}

func TestAdminHandlers_Debugger_OK(t *testing.T) {
	r := setUpRouter()
	req := httptest.NewRequest(http.MethodGet, "/v1/debug/mediation?placement_id=&n=10", nil)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
	var out jsonResp
	_ = json.Unmarshal(rec.Body.Bytes(), &out)
	if ok, _ := out["success"].(bool); !ok {
		t.Fatalf("expected success=true in response")
	}
}

func TestAdminHandlers_Overview_OK(t *testing.T) {
	r := setUpRouter()
	req := httptest.NewRequest(http.MethodGet, "/v1/metrics/overview?placement_id=&n=5", nil)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
	var out jsonResp
	if err := json.Unmarshal(rec.Body.Bytes(), &out); err != nil {
		t.Fatalf("invalid JSON: %v", err)
	}
	data, _ := out["data"].(map[string]any)
	if data == nil {
		t.Fatalf("expected data field in response")
	}
	if _, ok := data["slo"]; !ok {
		t.Fatalf("expected slo in overview data")
	}
	if _, ok := data["debugger"]; !ok {
		t.Fatalf("expected debugger in overview data")
	}
}
