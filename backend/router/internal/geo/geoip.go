package geo

import (
	"context"
	"net"

	"github.com/oschwald/geoip2-golang"
	log "github.com/sirupsen/logrus"
)

// GeoLocation represents geographic location data
type GeoLocation struct {
	Country     string  `json:"country"`
	CountryCode string  `json:"country_code"`
	City        string  `json:"city"`
	Latitude    float64 `json:"latitude"`
	Longitude   float64 `json:"longitude"`
	Timezone    string  `json:"timezone"`
	Continent   string  `json:"continent"`
}

// GeoRouter handles geographic routing
type GeoRouter struct {
	geoipDB *geoip2.Reader
}

// NewGeoRouter creates a new geo router
func NewGeoRouter(geoipDBPath string) (*GeoRouter, error) {
	db, err := geoip2.Open(geoipDBPath)
	if err != nil {
		log.WithError(err).Error("Failed to open GeoIP database")
		// Return router without GeoIP - will use fallback
		return &GeoRouter{geoipDB: nil}, nil
	}

	log.Info("GeoIP database loaded successfully")
	return &GeoRouter{geoipDB: db}, nil
}

// Close closes the GeoIP database
func (gr *GeoRouter) Close() error {
	if gr.geoipDB != nil {
		return gr.geoipDB.Close()
	}
	return nil
}

// Lookup looks up geographic location for an IP address
func (gr *GeoRouter) Lookup(ctx context.Context, ipStr string) (*GeoLocation, error) {
	if gr.geoipDB == nil {
		// Return default location if no GeoIP DB
		return &GeoLocation{
			Country:     "Unknown",
			CountryCode: "XX",
			City:        "Unknown",
			Continent:   "Unknown",
		}, nil
	}

	ip := net.ParseIP(ipStr)
	if ip == nil {
		return nil, nil
	}

	record, err := gr.geoipDB.City(ip)
	if err != nil {
		log.WithError(err).WithField("ip", ipStr).Warn("GeoIP lookup failed")
		return nil, err
	}

	location := &GeoLocation{
		Country:     record.Country.Names["en"],
		CountryCode: record.Country.IsoCode,
		City:        record.City.Names["en"],
		Latitude:    record.Location.Latitude,
		Longitude:   record.Location.Longitude,
		Timezone:    record.Location.TimeZone,
		Continent:   record.Continent.Names["en"],
	}

	return location, nil
}

// GetRegion returns the region for routing purposes
func (gr *GeoRouter) GetRegion(ctx context.Context, ipStr string) string {
	location, err := gr.Lookup(ctx, ipStr)
	if err != nil || location == nil {
		return "us-east" // Default region
	}

	// Map countries to regions
	switch location.CountryCode {
	case "US", "CA", "MX":
		return "us-east"
	case "GB", "FR", "DE", "IT", "ES", "NL", "BE", "CH", "AT", "PL":
		return "eu-west"
	case "CN", "JP", "KR", "SG", "HK", "TW":
		return "asia-east"
	case "IN":
		return "asia-south"
	case "AU", "NZ":
		return "asia-pacific"
	case "BR", "AR", "CL", "CO":
		return "sa-east"
	case "ZA", "NG", "KE", "EG":
		return "africa"
	default:
		return "us-east" // Default fallback
	}
}

// IsHighValueGeo checks if location is high-value for ad targeting
func (gr *GeoRouter) IsHighValueGeo(ctx context.Context, ipStr string) bool {
	location, err := gr.Lookup(ctx, ipStr)
	if err != nil || location == nil {
		return false
	}

	// Tier 1 countries (high CPM)
	tier1Countries := map[string]bool{
		"US": true, "CA": true, "GB": true, "AU": true,
		"DE": true, "FR": true, "JP": true, "NL": true,
		"SE": true, "NO": true, "DK": true, "CH": true,
	}

	return tier1Countries[location.CountryCode]
}
