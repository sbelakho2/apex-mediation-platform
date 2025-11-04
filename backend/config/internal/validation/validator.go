package validation

import (
	"encoding/json"
	"errors"
	"fmt"

	"google.golang.org/protobuf/encoding/protojson"
	"google.golang.org/protobuf/reflect/protoreflect"
	"google.golang.org/protobuf/types/dynamicpb"
)

// Validator validates configuration payloads
type Validator struct {
	schemas map[string]protoreflect.MessageDescriptor
}

// NewValidator creates a new configuration validator
func NewValidator() *Validator {
	return &Validator{
		schemas: make(map[string]protoreflect.MessageDescriptor),
	}
}

// RegisterSchema registers a protobuf schema for validation
func (v *Validator) RegisterSchema(name string, descriptor protoreflect.MessageDescriptor) {
	v.schemas[name] = descriptor
}

// Validate validates a configuration payload against a schema
func (v *Validator) Validate(schemaName string, payload []byte) error {
	descriptor, ok := v.schemas[schemaName]
	if !ok {
		return fmt.Errorf("unknown schema: %s", schemaName)
	}

	// Create a new message instance using MessageType
	msgType := dynamicpb.NewMessageType(descriptor)
	msg := msgType.New().Interface()

	// Unmarshal with strict validation
	unmarshaler := protojson.UnmarshalOptions{
		DiscardUnknown: false, // Reject unknown fields
	}

	if err := unmarshaler.Unmarshal(payload, msg); err != nil {
		return fmt.Errorf("validation failed: %w", err)
	}

	// Validate required fields
	if err := validateRequiredFields(msg.ProtoReflect()); err != nil {
		return err
	}

	// Validate field constraints
	if err := validateConstraints(msg.ProtoReflect()); err != nil {
		return err
	}

	return nil
}

// ValidateJSON validates a JSON configuration against basic rules
func (v *Validator) ValidateJSON(payload []byte) error {
	var data map[string]interface{}
	if err := json.Unmarshal(payload, &data); err != nil {
		return fmt.Errorf("invalid JSON: %w", err)
	}

	// Check for required top-level fields
	requiredFields := []string{"version", "app_id"}
	for _, field := range requiredFields {
		if _, ok := data[field]; !ok {
			return fmt.Errorf("missing required field: %s", field)
		}
	}

	// Validate version format
	version, ok := data["version"].(float64)
	if !ok || version < 1 {
		return errors.New("invalid version: must be positive integer")
	}

	// Validate app_id format
	appID, ok := data["app_id"].(string)
	if !ok || appID == "" {
		return errors.New("invalid app_id: must be non-empty string")
	}

	return nil
}

// validateRequiredFields checks that all required fields are set
func validateRequiredFields(msg protoreflect.Message) error {
	var missingFields []string

	msg.Range(func(fd protoreflect.FieldDescriptor, v protoreflect.Value) bool {
		if fd.Cardinality() == protoreflect.Required && !msg.Has(fd) {
			missingFields = append(missingFields, string(fd.Name()))
		}
		return true
	})

	if len(missingFields) > 0 {
		return fmt.Errorf("missing required fields: %v", missingFields)
	}

	return nil
}

// validateConstraints validates field-specific constraints
func validateConstraints(msg protoreflect.Message) error {
	var errors []string

	msg.Range(func(fd protoreflect.FieldDescriptor, v protoreflect.Value) bool {
		// Validate string length
		if fd.Kind() == protoreflect.StringKind {
			str := v.String()
			if len(str) > 1000 {
				errors = append(errors, fmt.Sprintf("field %s exceeds maximum length", fd.Name()))
			}
		}

		// Validate number ranges
		if fd.Kind() == protoreflect.Int32Kind || fd.Kind() == protoreflect.Int64Kind {
			num := v.Int()
			if num < 0 {
				errors = append(errors, fmt.Sprintf("field %s must be non-negative", fd.Name()))
			}
		}

		// Validate repeated field size
		if fd.IsList() {
			list := v.List()
			if list.Len() > 100 {
				errors = append(errors, fmt.Sprintf("field %s exceeds maximum array size", fd.Name()))
			}
		}

		return true
	})

	if len(errors) > 0 {
		return fmt.Errorf("constraint violations: %v", errors)
	}

	return nil
}

// ValidateSize checks if payload size is within limits
func (v *Validator) ValidateSize(payload []byte) error {
	const maxSize = 1024 * 1024 // 1MB

	if len(payload) > maxSize {
		return fmt.Errorf("payload size %d exceeds maximum %d bytes", len(payload), maxSize)
	}

	return nil
}

// SanitizePayload removes potentially dangerous fields
func (v *Validator) SanitizePayload(payload []byte) ([]byte, error) {
	var data map[string]interface{}
	if err := json.Unmarshal(payload, &data); err != nil {
		return nil, err
	}

	// Remove dangerous fields
	dangerousFields := []string{"__proto__", "constructor", "prototype"}
	for _, field := range dangerousFields {
		delete(data, field)
	}

	// Sanitize nested objects
	sanitizeNested(data)

	return json.Marshal(data)
}

func sanitizeNested(data map[string]interface{}) {
	for _, value := range data {
		if nested, ok := value.(map[string]interface{}); ok {
			dangerousFields := []string{"__proto__", "constructor", "prototype"}
			for _, field := range dangerousFields {
				delete(nested, field)
			}
			sanitizeNested(nested)
		}

		if arr, ok := value.([]interface{}); ok {
			for _, item := range arr {
				if nested, ok := item.(map[string]interface{}); ok {
					sanitizeNested(nested)
				}
			}
		}
	}
}
