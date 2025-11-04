package signing

import (
	"crypto/ed25519"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"errors"
	"io/ioutil"
	"time"

	log "github.com/sirupsen/logrus"
)

// Ed25519Signer handles cryptographic signing of configurations
type Ed25519Signer struct {
	privateKey ed25519.PrivateKey
	publicKey  ed25519.PublicKey
}

// SignedConfig represents a cryptographically signed configuration
type SignedConfig struct {
	ConfigID  string    `json:"config_id"`
	Version   int64     `json:"version"`
	Payload   []byte    `json:"payload"`
	Signature string    `json:"signature"`
	SignedAt  time.Time `json:"signed_at"`
	PublicKey string    `json:"public_key"`
}

// NewEd25519Signer creates a new signer with the given key file
func NewEd25519Signer(keyPath string) (*Ed25519Signer, error) {
	// Try to load existing key
	privateKey, err := loadPrivateKey(keyPath)
	if err != nil {
		// Generate new key pair if not found
		log.Warn("Private key not found, generating new key pair")
		publicKey, privateKey, err := ed25519.GenerateKey(rand.Reader)
		if err != nil {
			return nil, err
		}

		// Save private key
		if err := savePrivateKey(keyPath, privateKey); err != nil {
			return nil, err
		}

		log.Infof("Generated new Ed25519 key pair")
		log.Infof("Public key: %s", base64.StdEncoding.EncodeToString(publicKey))

		return &Ed25519Signer{
			privateKey: privateKey,
			publicKey:  publicKey,
		}, nil
	}

	publicKey := privateKey.Public().(ed25519.PublicKey)

	return &Ed25519Signer{
		privateKey: privateKey,
		publicKey:  publicKey,
	}, nil
}

// Sign creates a cryptographically signed configuration
func (s *Ed25519Signer) Sign(configID string, version int64, payload []byte) (*SignedConfig, error) {
	// Create message to sign
	message := createSigningMessage(configID, version, payload)

	// Sign the message
	signature := ed25519.Sign(s.privateKey, message)

	return &SignedConfig{
		ConfigID:  configID,
		Version:   version,
		Payload:   payload,
		Signature: base64.StdEncoding.EncodeToString(signature),
		SignedAt:  time.Now().UTC(),
		PublicKey: base64.StdEncoding.EncodeToString(s.publicKey),
	}, nil
}

// Verify validates a signed configuration
func (s *Ed25519Signer) Verify(signed *SignedConfig) error {
	// Decode signature
	signature, err := base64.StdEncoding.DecodeString(signed.Signature)
	if err != nil {
		return errors.New("invalid signature encoding")
	}

	// Decode public key
	publicKey, err := base64.StdEncoding.DecodeString(signed.PublicKey)
	if err != nil {
		return errors.New("invalid public key encoding")
	}

	// Recreate message
	message := createSigningMessage(signed.ConfigID, signed.Version, signed.Payload)

	// Verify signature
	if !ed25519.Verify(publicKey, message, signature) {
		return errors.New("signature verification failed")
	}

	return nil
}

// GetPublicKey returns the base64-encoded public key
func (s *Ed25519Signer) GetPublicKey() string {
	return base64.StdEncoding.EncodeToString(s.publicKey)
}

// RotateKey generates a new key pair and returns the public key
func (s *Ed25519Signer) RotateKey(keyPath string) (string, error) {
	publicKey, privateKey, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		return "", err
	}

	// Save new private key
	if err := savePrivateKey(keyPath, privateKey); err != nil {
		return "", err
	}

	// Update signer
	s.privateKey = privateKey
	s.publicKey = publicKey

	log.Info("Key rotation completed")

	return base64.StdEncoding.EncodeToString(publicKey), nil
}

// Helper functions

func createSigningMessage(configID string, version int64, payload []byte) []byte {
	type signingData struct {
		ConfigID string `json:"config_id"`
		Version  int64  `json:"version"`
		Payload  []byte `json:"payload"`
	}

	data := signingData{
		ConfigID: configID,
		Version:  version,
		Payload:  payload,
	}

	message, _ := json.Marshal(data)
	return message
}

func loadPrivateKey(path string) (ed25519.PrivateKey, error) {
	data, err := ioutil.ReadFile(path)
	if err != nil {
		return nil, err
	}

	key, err := base64.StdEncoding.DecodeString(string(data))
	if err != nil {
		return nil, err
	}

	if len(key) != ed25519.PrivateKeySize {
		return nil, errors.New("invalid private key size")
	}

	return ed25519.PrivateKey(key), nil
}

func savePrivateKey(path string, key ed25519.PrivateKey) error {
	encoded := base64.StdEncoding.EncodeToString(key)
	return ioutil.WriteFile(path, []byte(encoded), 0600)
}
