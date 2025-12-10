# Reporting API

## Overview

The Reporting API allows you to programmatically retrieve performance data for your apps and ad units. You can query for metrics like impressions, revenue, and eCPM, grouped by various dimensions.

**Base URL**: `https://api.apexmediation.com/v1/reporting`

## Authentication

All requests must include your API Key in the `Authorization` header.

```http
Authorization: Bearer YOUR_API_KEY
```

You can generate an API Key in the Console under **Account Settings > API Keys**.

## Endpoints

### Generate Report

`POST /report`

Generates a report based on the provided criteria.

**Request Body:**

```json
{
  "startDate": "2023-10-01",
  "endDate": "2023-10-07",
  "dimensions": [
    "date",
    "app",
    "ad_unit",
    "country"
  ],
  "metrics": [
    "requests",
    "impressions",
    "revenue",
    "ecpm",
    "fill_rate"
  ],
  "filters": [
    {
      "dimension": "app",
      "operator": "in",
      "values": ["app_id_123"]
    }
  ],
  "timezone": "UTC"
}
```

**Response:**

```json
{
  "data": [
    {
      "date": "2023-10-01",
      "app": "My Game",
      "ad_unit": "Interstitial_LevelComplete",
      "country": "US",
      "requests": 1500,
      "impressions": 1200,
      "revenue": 15.50,
      "ecpm": 12.92,
      "fill_rate": 0.80
    }
    // ... more rows
  ]
}
```

## Dimensions & Metrics

### Dimensions

| Dimension | Description |
| :--- | :--- |
| `date` | Date of the event (YYYY-MM-DD). |
| `app` | Name of the application. |
| `ad_unit` | Name of the ad unit/placement. |
| `country` | 2-letter ISO country code. |
| `network` | The ad network that filled the request. |
| `platform` | `android`, `ios`, `web`, etc. |

### Metrics

| Metric | Description |
| :--- | :--- |
| `requests` | Total ad requests sent to mediation. |
| `impressions` | Total ads displayed to users. |
| `revenue` | Estimated revenue in USD. |
| `ecpm` | Effective Cost Per Mille (Revenue / Impressions * 1000). |
| `fill_rate` | Impressions / Requests. |
| `clicks` | Total clicks on ads. |
| `ctr` | Click-Through Rate (Clicks / Impressions). |

## Rate Limits

*   **100 requests per minute** per API Key.
*   **10,000 requests per day** per API Key.

If you exceed these limits, you will receive a `429 Too Many Requests` response.
