# Management API

## Overview

The Management API allows you to programmatically configure your apps, ad units, and mediation waterfalls. This is useful for automating setup or syncing configurations with your internal systems.

**Base URL**: `https://api.apexmediation.com/v1/management`

## Authentication

All requests must include your API Key in the `Authorization` header.

```http
Authorization: Bearer YOUR_API_KEY
```

## Resources

### Apps

#### List Apps

`GET /apps`

Returns a list of all applications in your account.

#### Create App

`POST /apps`

```json
{
  "name": "My New Game",
  "platform": "android",
  "bundle_id": "com.example.mygame",
  "store_url": "https://play.google.com/store/apps/details?id=com.example.mygame"
}
```

### Ad Units

#### List Ad Units

`GET /apps/{app_id}/adunits`

#### Create Ad Unit

`POST /apps/{app_id}/adunits`

```json
{
  "name": "Level Complete Interstitial",
  "format": "interstitial",
  "reward_settings": null
}
```

### Waterfall Configuration

#### Get Waterfall

`GET /apps/{app_id}/adunits/{ad_unit_id}/waterfall`

#### Update Waterfall

`PUT /apps/{app_id}/adunits/{ad_unit_id}/waterfall`

This endpoint allows you to configure the priority and settings for different ad networks.

```json
{
  "items": [
    {
      "network": "admob",
      "priority": 1,
      "settings": {
        "ad_unit_id": "ca-app-pub-xxx/xxx"
      }
    },
    {
      "network": "applovin",
      "priority": 2,
      "settings": {
        "zone_id": "xxx"
      }
    }
  ]
}
```

## Error Handling

*   `400 Bad Request`: Invalid parameters.
*   `401 Unauthorized`: Invalid API Key.
*   `403 Forbidden`: You do not have permission to access this resource.
*   `404 Not Found`: The requested resource does not exist.
