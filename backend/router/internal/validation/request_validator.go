package validation

import (
	"net"
	"regexp"
	"strings"
)

// AdRequest represents an ad request to validate
type AdRequest struct {
	PublisherID  string            `json:"publisher_id"`
	PlacementID  string            `json:"placement_id"`
	AdFormat     string            `json:"ad_format"` // banner, interstitial, rewarded
	DeviceID     string            `json:"device_id"`
	IP           string            `json:"ip"`
	UserAgent    string            `json:"user_agent"`
	AppID        string            `json:"app_id"`
	AppVersion   string            `json:"app_version"`
	OSVersion    string            `json:"os_version"`
	DeviceModel  string            `json:"device_model"`
	CustomParams map[string]string `json:"custom_params,omitempty"`
}

// ValidationError represents a validation error
type ValidationError struct {
	Field   string `json:"field"`
	Message string `json:"message"`
}

// Validator validates ad requests
type Validator struct {
	uuidRegex *regexp.Regexp
}

// NewValidator creates a new validator
func NewValidator() *Validator {
	return &Validator{
		uuidRegex: regexp.MustCompile(`^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}$`),
	}
}

// ValidateRequest validates an ad request
func (v *Validator) ValidateRequest(req *AdRequest) []ValidationError {
	var errors []ValidationError

	// Validate publisher ID
	if req.PublisherID == "" {
		errors = append(errors, ValidationError{
			Field:   "publisher_id",
			Message: "publisher_id is required",
		})
	}

	// Validate placement ID
	if req.PlacementID == "" {
		errors = append(errors, ValidationError{
			Field:   "placement_id",
			Message: "placement_id is required",
		})
	}

	// Validate ad format
	validFormats := map[string]bool{
		"banner":       true,
		"interstitial": true,
		"rewarded":     true,
		"native":       true,
	}
	if !validFormats[req.AdFormat] {
		errors = append(errors, ValidationError{
			Field:   "ad_format",
			Message: "ad_format must be one of: banner, interstitial, rewarded, native",
		})
	}

	// Validate device ID
	if req.DeviceID == "" {
		errors = append(errors, ValidationError{
			Field:   "device_id",
			Message: "device_id is required",
		})
	}

	// Validate IP address
	if req.IP != "" {
		if net.ParseIP(req.IP) == nil {
			errors = append(errors, ValidationError{
				Field:   "ip",
				Message: "invalid IP address",
			})
		}
	} else {
		errors = append(errors, ValidationError{
			Field:   "ip",
			Message: "ip is required",
		})
	}

	// Validate user agent
	if req.UserAgent == "" {
		errors = append(errors, ValidationError{
			Field:   "user_agent",
			Message: "user_agent is required",
		})
	} else if len(req.UserAgent) < 10 {
		errors = append(errors, ValidationError{
			Field:   "user_agent",
			Message: "user_agent too short",
		})
	}

	// Validate app ID
	if req.AppID == "" {
		errors = append(errors, ValidationError{
			Field:   "app_id",
			Message: "app_id is required",
		})
	}

	return errors
}

// IsValid checks if request has no validation errors
func (v *Validator) IsValid(req *AdRequest) bool {
	return len(v.ValidateRequest(req)) == 0
}

// ValidatePublisherID validates publisher ID format
func (v *Validator) ValidatePublisherID(publisherID string) bool {
	if publisherID == "" {
		return false
	}

	// Check if it's a UUID or alphanumeric ID
	if v.uuidRegex.MatchString(publisherID) {
		return true
	}

	// Allow alphanumeric with underscores/hyphens
	alphanumericRegex := regexp.MustCompile(`^[a-zA-Z0-9_-]+$`)
	return alphanumericRegex.MatchString(publisherID) && len(publisherID) >= 3
}

// ValidatePlacementID validates placement ID format
func (v *Validator) ValidatePlacementID(placementID string) bool {
	if placementID == "" {
		return false
	}

	alphanumericRegex := regexp.MustCompile(`^[a-zA-Z0-9_-]+$`)
	return alphanumericRegex.MatchString(placementID) && len(placementID) >= 3
}

// SanitizeUserAgent sanitizes user agent string
func (v *Validator) SanitizeUserAgent(userAgent string) string {
	// Remove control characters and excessive whitespace
	userAgent = strings.TrimSpace(userAgent)
	userAgent = strings.Map(func(r rune) rune {
		if r < 32 || r == 127 {
			return -1
		}
		return r
	}, userAgent)

	// Limit length
	if len(userAgent) > 500 {
		userAgent = userAgent[:500]
	}

	return userAgent
}

// ValidateIPv4 checks if string is valid IPv4
func (v *Validator) ValidateIPv4(ip string) bool {
	parsedIP := net.ParseIP(ip)
	if parsedIP == nil {
		return false
	}
	return parsedIP.To4() != nil
}

// ValidateIPv6 checks if string is valid IPv6
func (v *Validator) ValidateIPv6(ip string) bool {
	parsedIP := net.ParseIP(ip)
	if parsedIP == nil {
		return false
	}
	return parsedIP.To4() == nil
}
