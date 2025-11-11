package api

import (
	"encoding/json"
	"net"
	"net/http"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"
)

// --- Admin security middlewares (all opt-in via env flags) ---

// AdminAuthMiddleware enforces a static Bearer token on protected routes when ADMIN_API_BEARER is set.
func AdminAuthMiddleware(next http.Handler) http.Handler {
	bearer := strings.TrimSpace(os.Getenv("ADMIN_API_BEARER"))
	if bearer == "" {
		return next // disabled → no-op for full backward compatibility
	}
	const prefix = "Bearer "
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		auth := r.Header.Get("Authorization")
		if !strings.HasPrefix(auth, prefix) || strings.TrimSpace(strings.TrimPrefix(auth, prefix)) != bearer {
			writeAdminError(w, http.StatusUnauthorized, "unauthorized", "Missing or invalid bearer token")
			return
		}
		next.ServeHTTP(w, r)
	})
}

// AdminIPAllowlistMiddleware restricts access to the given CIDR/IP allowlist when ADMIN_IP_ALLOWLIST is set.
func AdminIPAllowlistMiddleware(next http.Handler) http.Handler {
	val := strings.TrimSpace(os.Getenv("ADMIN_IP_ALLOWLIST"))
	if val == "" {
		return next // disabled
	}
	var nets []*net.IPNet
	for _, part := range strings.Split(val, ",") {
		p := strings.TrimSpace(part)
		if p == "" { continue }
		if ip := net.ParseIP(p); ip != nil { // exact IP
			// convert exact IP to /32 or /128 network
			bits := 32
			if ip.To4() == nil { bits = 128 }
			_, n, _ := net.ParseCIDR(p + "/" + strconv.Itoa(bits))
			nets = append(nets, n)
			continue
		}
		_, n, err := net.ParseCIDR(p)
		if err == nil { nets = append(nets, n) }
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ip := clientIP(r)
		if ip == nil {
			writeAdminError(w, http.StatusForbidden, "forbidden", "Unable to determine client IP")
			return
		}
		allowed := false
		for _, n := range nets {
			if n.Contains(ip) { allowed = true; break }
		}
		if !allowed {
			writeAdminError(w, http.StatusForbidden, "forbidden", "IP not allowlisted")
			return
		}
		next.ServeHTTP(w, r)
	})
}

// Rate limiter (token bucket) keyed by route+clientIP. Optional via ADMIN_RATELIMIT_WINDOW and ADMIN_RATELIMIT_BURST.

type bucket struct {
	mu    sync.Mutex
	tokens float64
	last  time.Time
}

type limiter struct {
	mu     sync.Mutex
	buckets map[string]*bucket
	rate   float64 // tokens per second
	burst  float64
}

func newLimiter(window time.Duration, burst int) *limiter {
	if window <= 0 { window = time.Minute }
	if burst <= 0 { burst = 60 }
	return &limiter{
		buckets: make(map[string]*bucket),
		rate:   float64(burst) / window.Seconds(),
		burst:  float64(burst),
	}
}

func (l *limiter) allow(key string) bool {
	l.mu.Lock()
	b := l.buckets[key]
	if b == nil {
		b = &bucket{tokens: l.burst, last: time.Now()}
		l.buckets[key] = b
	}
	l.mu.Unlock()

	b.mu.Lock()
	defer b.mu.Unlock()
	now := time.Now()
	// Refill
	elapsed := now.Sub(b.last).Seconds()
	b.tokens = min(l.burst, b.tokens+elapsed*l.rate)
	b.last = now
	if b.tokens >= 1 {
		b.tokens -= 1
		return true
	}
	return false
}

func min(a, b float64) float64 { if a < b { return a }; return b }

// AdminRateLimitMiddleware applies rate limiting when both ADMIN_RATELIMIT_WINDOW and ADMIN_RATELIMIT_BURST are set.
func AdminRateLimitMiddleware(next http.Handler) http.Handler {
	win := strings.TrimSpace(os.Getenv("ADMIN_RATELIMIT_WINDOW"))
	burstStr := strings.TrimSpace(os.Getenv("ADMIN_RATELIMIT_BURST"))
	if win == "" || burstStr == "" {
		return next // disabled
	}
	d, err := time.ParseDuration(win)
	if err != nil { d = time.Minute }
	b, err := strconv.Atoi(burstStr)
	if err != nil || b <= 0 { b = 60 }
	lim := newLimiter(d, b)
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		key := r.URL.Path + ":" + clientIP(r).String()
		if !lim.allow(key) {
			writeAdminError(w, http.StatusTooManyRequests, "rate_limited", "Too many requests")
			return
		}
		next.ServeHTTP(w, r)
	})
}

// clientIP extracts a best-effort client IP from headers or remote addr.
func clientIP(r *http.Request) net.IP {
	// X-Forwarded-For may contain a list — take the first
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		parts := strings.Split(xff, ",")
		if ip := net.ParseIP(strings.TrimSpace(parts[0])); ip != nil { return ip }
	}
	// X-Real-IP
	if xr := r.Header.Get("X-Real-IP"); xr != "" {
		if ip := net.ParseIP(strings.TrimSpace(xr)); ip != nil { return ip }
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err == nil {
		if ip := net.ParseIP(host); ip != nil { return ip }
	}
	return nil
}

// writeAdminError writes a standard error envelope with schema_version for admin endpoints.
func writeAdminError(w http.ResponseWriter, status int, code, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]any{
		"schema_version": 1,
		"success":        false,
		"error": map[string]any{
			"code":    code,
			"message": message,
		},
	})
}
