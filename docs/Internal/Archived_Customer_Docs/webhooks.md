# Webhooks Guide

Receive real-time notifications about events in your ApexMediation account.

---

## Overview

Webhooks allow you to receive HTTP POST notifications when events occur in your ApexMediation account, such as:
- Payouts processed
- Revenue thresholds reached
- Fraud detected
- API errors

---

## Setup

### 1. Create Webhook Endpoint

Create an HTTPS endpoint on your server to receive webhook events:

```javascript
// Express.js example
const express = require('express');
const crypto = require('crypto');

const app = express();
app.use(express.json());

app.post('/webhooks/apexmediation', (req, res) => {
    const signature = req.headers['x-apexmediation-signature'];
    const secret = process.env.WEBHOOK_SECRET;

    // Verify signature
    const expectedSignature = crypto
        .createHmac('sha256', secret)
        .update(JSON.stringify(req.body))
        .digest('hex');

    if (signature !== expectedSignature) {
        return res.status(401).send('Invalid signature');
    }

    // Process event
    const event = req.body;
    handleWebhookEvent(event);

    // Acknowledge receipt
    res.status(200).send('OK');
});
```

### 2. Register Webhook

Register your webhook endpoint via API or dashboard:

**Via API:**
```bash
curl -X POST https://api.apexmediation.ee/v1/webhooks \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://yourapp.com/webhooks/apexmediation",
    "events": ["payout.succeeded", "fraud.detected"],
    "secret": "your_webhook_secret_key"
  }'
```

**Via Dashboard:**
1. Go to [console.apexmediation.ee/webhooks](https://console.apexmediation.ee/webhooks)
2. Click "Add Webhook"
3. Enter your endpoint URL
4. Select events to subscribe to
5. Save webhook secret key

---

## Event Types

### Payout Events

#### `payout.succeeded`

Triggered when a payout is successfully processed.

**Payload:**
```json
{
  "event": "payout.succeeded",
  "timestamp": "2025-11-04T10:00:00Z",
  "data": {
    "payout_id": "payout_abc123",
    "amount": 1250.00,
    "currency": "EUR",
    "method": "bank_transfer",
    "period": {
      "start": "2025-10-01",
      "end": "2025-10-31"
    },
    "processed_at": "2025-11-04T10:00:00Z",
    "recipient": {
      "iban": "EE**************1234",
      "name": "Your Company OÜ"
    }
  }
}
```

#### `payout.failed`

Triggered when a payout fails.

**Payload:**
```json
{
  "event": "payout.failed",
  "timestamp": "2025-11-04T10:00:00Z",
  "data": {
    "payout_id": "payout_abc123",
    "amount": 1250.00,
    "currency": "EUR",
    "reason": "invalid_iban",
    "message": "Recipient bank account is invalid"
  }
}
```

---

### Fraud Events

#### `fraud.detected`

Triggered when fraudulent activity is detected.

**Payload:**
```json
{
  "event": "fraud.detected",
  "timestamp": "2025-11-04T10:15:00Z",
  "data": {
    "fraud_type": "click_fraud",
    "severity": "high",
    "ip_address": "192.168.1.1",
    "device_id": "abc123xyz",
    "blocked": true,
    "details": {
      "clicks_per_hour": 500,
      "threshold": 50,
      "confidence": 0.95
    }
  }
}
```

---

### Threshold Events

#### `threshold.reached`

Triggered when a revenue or traffic threshold is reached.

**Payload:**
```json
{
  "event": "threshold.reached",
  "timestamp": "2025-11-04T11:00:00Z",
  "data": {
    "threshold_type": "revenue",
    "threshold_value": 1000.00,
    "current_value": 1000.50,
    "currency": "EUR",
    "period": "2025-11"
  }
}
```

---

### Error Events

#### `api.error`

Triggered when API errors exceed a certain rate.

**Payload:**
```json
{
  "event": "api.error",
  "timestamp": "2025-11-04T12:00:00Z",
  "data": {
    "endpoint": "/ads/request",
    "error_code": "invalid_request",
    "error_rate": 15.5,
    "threshold": 10.0,
    "sample_errors": [
      {
        "request_id": "req_abc123",
        "error": "Missing required field: placement_id",
        "timestamp": "2025-11-04T11:58:00Z"
      }
    ]
  }
}
```

---

## Security

### Verify Webhook Signature

Always verify the webhook signature to ensure the request came from ApexMediation:

**Node.js:**
```javascript
const crypto = require('crypto');

function verifyWebhookSignature(payload, signature, secret) {
    const expectedSignature = crypto
        .createHmac('sha256', secret)
        .update(JSON.stringify(payload))
        .digest('hex');

    return crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expectedSignature)
    );
}

// Usage
if (!verifyWebhookSignature(req.body, req.headers['x-apexmediation-signature'], WEBHOOK_SECRET)) {
    return res.status(401).send('Invalid signature');
}
```

**Python:**
```python
import hmac
import hashlib
import json

def verify_webhook_signature(payload, signature, secret):
    expected_signature = hmac.new(
        secret.encode('utf-8'),
        json.dumps(payload).encode('utf-8'),
        hashlib.sha256
    ).hexdigest()

    return hmac.compare_digest(signature, expected_signature)

# Usage
if not verify_webhook_signature(request.json, request.headers['X-Adstack-Signature'], WEBHOOK_SECRET):
    return 'Invalid signature', 401
```

**PHP:**
```php
<?php
function verifyWebhookSignature($payload, $signature, $secret) {
    $expectedSignature = hash_hmac(
        'sha256',
        json_encode($payload),
        $secret
    );

    return hash_equals($signature, $expectedSignature);
}

// Usage
$payload = json_decode(file_get_contents('php://input'), true);
$signature = $_SERVER['HTTP_X_ADSTACK_SIGNATURE'];

if (!verifyWebhookSignature($payload, $signature, $webhookSecret)) {
    http_response_code(401);
    die('Invalid signature');
}
?>
```

---

## Best Practices

### 1. Acknowledge Receipt Quickly

Respond with `200 OK` within 5 seconds to avoid timeouts:

```javascript
app.post('/webhooks/apexmediation', async (req, res) => {
    // Verify signature
    if (!verifySignature(req)) {
        return res.status(401).send('Invalid signature');
    }

    // Acknowledge immediately
    res.status(200).send('OK');

    // Process event asynchronously
    processEventAsync(req.body);
});

async function processEventAsync(event) {
    try {
        await handleWebhookEvent(event);
    } catch (error) {
        console.error('Error processing webhook:', error);
    }
}
```

### 2. Handle Idempotency

Process each event only once, even if received multiple times:

```javascript
const processedEvents = new Set();

async function handleWebhookEvent(event) {
    const eventId = `${event.event}_${event.timestamp}_${event.data.payout_id}`;

    if (processedEvents.has(eventId)) {
        console.log('Event already processed:', eventId);
        return;
    }

    // Process event
    await processEvent(event);

    // Mark as processed
    processedEvents.add(eventId);
}
```

### 3. Implement Retry Logic

Store failed events and retry processing:

```javascript
async function processEventAsync(event) {
    const maxRetries = 3;
    let attempt = 0;

    while (attempt < maxRetries) {
        try {
            await handleWebhookEvent(event);
            break;
        } catch (error) {
            attempt++;
            console.error(`Attempt ${attempt} failed:`, error);

            if (attempt >= maxRetries) {
                // Store in dead letter queue
                await storeFailedEvent(event, error);
            } else {
                // Wait before retry (exponential backoff)
                await sleep(Math.pow(2, attempt) * 1000);
            }
        }
    }
}
```

### 4. Use HTTPS

Always use HTTPS for your webhook endpoint. ApexMediation will reject HTTP URLs.

---

## Testing

### Test Webhook Locally

Use ngrok to test webhooks on localhost:

```bash
# Install ngrok
brew install ngrok

# Start your local server
node server.js

# Expose to internet
ngrok http 3000

# Use ngrok URL in webhook registration
# https://abc123.ngrok.io/webhooks/apexmediation
```

### Trigger Test Events

Trigger test events from dashboard:

1. Go to [console.apexmediation.ee/webhooks](https://console.apexmediation.ee/webhooks)
2. Click on your webhook
3. Click "Send Test Event"
4. Select event type
5. Click "Send"

---

## Monitoring

### View Webhook Logs

View webhook delivery logs in dashboard:

1. Go to [console.apexmediation.ee/webhooks](https://console.apexmediation.ee/webhooks)
2. Click on your webhook
3. View "Delivery History"

**Log details:**
- Event type
- Delivery status (success/failed)
- Response code
- Response time
- Retry attempts

---

## Troubleshooting

### Webhook Not Receiving Events

**Check:**
1. Endpoint is accessible from internet (not localhost)
2. Using HTTPS (not HTTP)
3. Webhook is active in dashboard
4. Subscribed to correct events
5. No firewall blocking requests

### 401 Unauthorized

**Check:**
- Signature verification logic is correct
- Using correct webhook secret
- Comparing signatures securely (use `crypto.timingSafeEqual`)

### 500 Internal Server Error

**Check:**
- Endpoint responds within 5 seconds
- No uncaught exceptions in handler
- Database connections don't timeout

---

## Rate Limits

- Maximum 10 webhooks per account
- Maximum 100 events per second per webhook
- Failed deliveries retry 3 times with exponential backoff

---

## Support

For webhook issues:
- **Email**: support@apexmediation.ee
- **Discord**: [discord.gg/apexmediation](https://discord.gg/apexmediation)
- **Status**: [status.apexmediation.ee](https://status.apexmediation.ee)

---

**Last Updated**: November 2025
**API Version**: v1
