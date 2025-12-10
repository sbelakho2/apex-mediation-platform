# Web SDK Integration

## Quick Start

### 1. Add Script Tag

Add the Apex Mediation script to the `<head>` of your HTML page:

```html
<script src="https://cdn.apexmediation.com/sdk/web/v1/apex.min.js" async></script>
```

### 2. Initialize SDK

Initialize the SDK with your App ID (Site ID). You can do this in a separate script block or your main bundle.

```javascript
window.apex = window.apex || [];
function apex() { window.apex.push(arguments); }

apex('init', {
  appId: 'YOUR_SITE_ID'
});
```

### 3. Define Ad Slots

Place a container `<div>` where you want the ad to appear, and call `defineSlot`.

```html
<!-- Ad Container -->
<div id="ad-slot-1" style="width: 300px; height: 250px;"></div>

<script>
  apex('defineSlot', {
    placementId: 'PLACEMENT_ID',
    containerId: 'ad-slot-1',
    size: [300, 250]
  });
</script>
```

### 4. Display Ads

Once slots are defined, request ads:

```javascript
apex('display', 'ad-slot-1');
```

## Key Concepts

*   **Site ID**: Equivalent to App ID for web properties.
*   **Container**: The DOM element where the ad will be rendered. Must have explicit dimensions or the ad may collapse.
*   **Async Loading**: The SDK loads asynchronously to avoid blocking page render. The `window.apex` queue ensures commands are executed once the SDK is ready.

## Single Page Applications (SPA)

For React, Vue, or Angular apps, you can install the NPM package:

```bash
npm install @apexmediation/web-sdk
```

**React Example:**

```jsx
import { ApexAd } from '@apexmediation/web-sdk/react';

function App() {
  return (
    <div>
      <h1>My App</h1>
      <ApexAd 
        placementId="PLACEMENT_ID" 
        width={300} 
        height={250} 
      />
    </div>
  );
}
```

## Integration Checklist

1.  [ ] Added script tag to `<head>`.
2.  [ ] Initialized with correct Site ID.
3.  [ ] Created container `<div>`s with correct IDs.
4.  [ ] Verified ads.txt is updated on your domain.
5.  [ ] Verified ads render in supported browsers.

## Debugging

Enable debug mode in the console:

```javascript
apex('setDebug', true);
```

Check the browser's Developer Tools > Console for logs prefixed with `[Apex]`.
