# Error Codes

This reference lists the error codes returned by the Apex Mediation SDK.

## General Errors

| Code | Name | Description |
| :--- | :--- | :--- |
| `1000` | `INTERNAL_ERROR` | An internal error occurred in the SDK. |
| `1001` | `INVALID_REQUEST` | The ad request was invalid (e.g., missing Placement ID). |
| `1002` | `NETWORK_ERROR` | Failed to connect to the server. Check internet connection. |
| `1003` | `NO_FILL` | No ads were available from any network in the waterfall. |
| `1004` | `TIMEOUT` | The ad request timed out before an ad could be loaded. |

## Initialization Errors

| Code | Name | Description |
| :--- | :--- | :--- |
| `2000` | `INIT_FAILED` | SDK initialization failed. |
| `2001` | `INVALID_APP_ID` | The provided App ID is invalid or disabled. |

## Display Errors

| Code | Name | Description |
| :--- | :--- | :--- |
| `3000` | `AD_NOT_READY` | Attempted to show an ad before it was fully loaded. |
| `3001` | `AD_EXPIRED` | The loaded ad has expired and cannot be shown. Reload required. |
| `3002` | `DISPLAY_FAILED` | A generic error occurred while trying to render the ad. |

## Native Ad Errors

| Code | Name | Description |
| :--- | :--- | :--- |
| `4000` | `MISSING_ASSETS` | The native ad response was missing required assets (e.g., icon, headline). |
