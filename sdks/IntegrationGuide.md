# Apex Mediation SDK Integration Guide

## iOS (Swift Package Manager)
1. In Xcode, open **File → Add Packages...**
2. Enter repository URL and select the `ApexMediation` package
3. Add `ApexMediation` to your app target dependencies
4. Initialize the SDK:

```swift
import ApexMediation

ApexMediation.shared.initialize(apiKey: "YOUR_KEY") { result in
    switch result {
    case .success:
        print("SDK ready")
    case .failure(let error):
        print("Init failed", error)
    }
}
```

## Android (Gradle)
1. Include the module in `settings.gradle.kts` and `build.gradle.kts`
2. Initialize in your `Application` class:

```kotlin
ApexMediation.initialize(this, "YOUR_KEY") { result ->
    result.onSuccess { Log.d("ApexMediation", "Ready") }
}
```

## Unity
1. Copy the `sdks/unity/Runtime` folder into your project
2. Call initialization:

```csharp
ApexMediation.Mediation.Instance.Initialize("YOUR_KEY", success =>
{
    Debug.Log($"SDK Ready: {success}");
});
```

## Web
1. Install the package:
   ```bash
   npm install @apexmediation/web-sdk
   ```
2. Initialize in your app:

```ts
import { ApexMediation } from '@apexmediation/web-sdk';

ApexMediation.initialize({ apiKey: 'YOUR_KEY', publisherId: 'pub_123' });
```
