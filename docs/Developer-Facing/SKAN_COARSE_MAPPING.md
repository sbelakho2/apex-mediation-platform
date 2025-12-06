# iOS SKAdNetwork Coarse Conversion Mapping

This document describes how the iOS core SDK expects SKAdNetwork metadata to be provided so that it can update conversion values and optionally display StoreKit overlays safely on the main thread.

## Metadata Contract

Populate the `Ad.metadata` dictionary coming from the auction service or adapters with the following keys:

| Key | Type | Description |
| --- | --- | --- |
| `skan_conversion_value` | `String` (0-63) | Optional fine conversion value supplied by the server. When present it is used verbatim. |
| `skan_coarse_value` | `String` (`low`, `medium`, `high`) | Coarse value used when SKAN 4 windows are still coarse-only. When no fine value is supplied the SDK synthesizes a fallback fine value (see table below). |
| `skan_lock_window` | `String` (`true`/`false`/`1`/`0`) | Indicates whether the current SKAN window should be locked when updating the conversion. Defaults to `false`. |
| `skoverlay_app_id` | `String` (App Store ID) | When present the SDK shows an `SKOverlay` with the provided App Store item id. |
| `skoverlay_position` | `String` (`bottom`, `bottomRaised`) | Optional overlay position. Defaults to `bottom`. |
| `skoverlay_dismissible` | `String` (`true`/`false`) | Controls whether the overlay is user-dismissible. Defaults to `true`. |

All values are strings to remain compatible with existing payloads. Booleans accept `true/false`, `yes/no`, or `1/0`.

## Coarse Conversion Mapping

When only a coarse value is supplied the SDK derives a deterministic fine value so we can still call `SKAdNetwork.updateConversionValue` on older iOS versions and `updatePostbackConversionValue` on iOS 16.1+. The mapping below is shared with Android and should be applied consistently on the auction service as well.

| Coarse Value | Synthesized Fine Value | Business Meaning |
| --- | --- | --- |
| `low` | `0` | Impression tracked, user did not complete a high-intent event yet. |
| `medium` | `32` | User reached a mid-funnel milestone (e.g. tutorial complete, add-to-cart). |
| `high` | `63` | User triggered top-funnel monetization (purchase/subscription) or highest-value KPI. |

If both fine and coarse values are supplied the SDK forwards the fine value and, on iOS 16.1+, also supplies the coarse value to `SKAdNetwork.updatePostbackConversionValue` so Apple can emit additional postbacks across windows.

## StoreKit Overlay Handling

`SKAdNetworkCoordinator` inspects overlay metadata when an ad is shown and delegates to `SKOverlayPresenter`. Presentation is always dispatched on the main actor and falls back to the first foreground `UIWindowScene` if the caller does not supply one.

- `overlay_position` supports `bottom` and `bottomRaised`, matching StoreKit's `SKOverlay.Position` values.
- `overlay_dismissible` defaults to `true`; set it to `false` for promotional overlays that should remain on screen until completion.

Because presentation requires a foreground scene, facades pass `viewController.view.window?.windowScene` into `recordImpression`. Custom integrations should do the same when bypassing the Bel facades.

## ATT and SKAN Interaction

ATT gating is handled by `TrackingAuthorizationManager`. Only when ATT is authorized and consent allows, the SDK forwards the IDFA alongside the SKAN metadata. Ensure you request ATT permission before loading ads when you rely on fine conversion values.
