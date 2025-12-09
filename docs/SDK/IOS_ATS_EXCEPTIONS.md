# iOS App Transport Security (ATS) Exceptions for Ad SDKs

Last updated: 2025-01-06
Owner: SDK Engineering

## Overview

App Transport Security (ATS) is an iOS feature that enforces secure network connections. Ad SDKs often require ATS exceptions to load ads from networks that may not fully support HTTPS.

---

## Default ATS Behavior

By default, ATS requires:
- HTTPS connections only (no HTTP)
- TLS 1.2 or later
- Forward secrecy cipher suites
- SHA-256 or better certificates

---

## Recommended ATS Configuration for Ad SDKs

Add this to your `Info.plist`:

```xml
<key>NSAppTransportSecurity</key>
<dict>
    <!-- Allow arbitrary loads for WKWebView in ads -->
    <key>NSAllowsArbitraryLoadsInWebContent</key>
    <true/>
    
    <!-- For iOS 9 compatibility (if needed) -->
    <key>NSAllowsArbitraryLoadsForMedia</key>
    <true/>
    
    <!-- Domain-specific exceptions -->
    <key>NSExceptionDomains</key>
    <dict>
        <!-- Google Ads -->
        <key>googleads.g.doubleclick.net</key>
        <dict>
            <key>NSExceptionAllowsInsecureHTTPLoads</key>
            <true/>
            <key>NSIncludesSubdomains</key>
            <true/>
        </dict>
        
        <!-- Google AdMob -->
        <key>googlesyndication.com</key>
        <dict>
            <key>NSExceptionAllowsInsecureHTTPLoads</key>
            <true/>
            <key>NSIncludesSubdomains</key>
            <true/>
        </dict>
        
        <!-- Facebook Audience Network -->
        <key>facebook.com</key>
        <dict>
            <key>NSExceptionAllowsInsecureHTTPLoads</key>
            <true/>
            <key>NSIncludesSubdomains</key>
            <true/>
        </dict>
        
        <!-- Unity Ads -->
        <key>unityads.unity3d.com</key>
        <dict>
            <key>NSExceptionAllowsInsecureHTTPLoads</key>
            <true/>
            <key>NSIncludesSubdomains</key>
            <true/>
        </dict>
        
    </dict>
</dict>
```

---

## Partner SDK-Specific Exceptions

### AdMob / Google Mobile Ads

```xml
<key>NSAppTransportSecurity</key>
<dict>
    <key>NSAllowsArbitraryLoadsInWebContent</key>
    <true/>
    <key>NSExceptionDomains</key>
    <dict>
        <key>google.com</key>
        <dict>
            <key>NSIncludesSubdomains</key>
            <true/>
            <key>NSExceptionAllowsInsecureHTTPLoads</key>
            <true/>
        </dict>
        <key>googleadservices.com</key>
        <dict>
            <key>NSIncludesSubdomains</key>
            <true/>
            <key>NSExceptionAllowsInsecureHTTPLoads</key>
            <true/>
        </dict>
        <key>googlesyndication.com</key>
        <dict>
            <key>NSIncludesSubdomains</key>
            <true/>
            <key>NSExceptionAllowsInsecureHTTPLoads</key>
            <true/>
        </dict>
        <key>doubleclick.net</key>
        <dict>
            <key>NSIncludesSubdomains</key>
            <true/>
            <key>NSExceptionAllowsInsecureHTTPLoads</key>
            <true/>
        </dict>
    </dict>
</dict>
```

### Facebook Audience Network

```xml
<key>NSAppTransportSecurity</key>
<dict>
    <key>NSAllowsArbitraryLoadsInWebContent</key>
    <true/>
    <key>NSExceptionDomains</key>
    <dict>
        <key>facebook.com</key>
        <dict>
            <key>NSIncludesSubdomains</key>
            <true/>
            <key>NSExceptionAllowsInsecureHTTPLoads</key>
            <true/>
        </dict>
        <key>fbcdn.net</key>
        <dict>
            <key>NSIncludesSubdomains</key>
            <true/>
            <key>NSExceptionAllowsInsecureHTTPLoads</key>
            <true/>
        </dict>
        <key>akamaihd.net</key>
        <dict>
            <key>NSIncludesSubdomains</key>
            <true/>
            <key>NSExceptionAllowsInsecureHTTPLoads</key>
            <true/>
        </dict>
    </dict>
</dict>
```

### AppLovin MAX

```xml
<key>NSAppTransportSecurity</key>
<dict>
    <key>NSAllowsArbitraryLoadsInWebContent</key>
    <true/>
    <key>NSExceptionDomains</key>
    <dict>
        <key>applovin.com</key>
        <dict>
            <key>NSIncludesSubdomains</key>
            <true/>
            <key>NSExceptionAllowsInsecureHTTPLoads</key>
            <true/>
        </dict>
        <key>applvn.com</key>
        <dict>
            <key>NSIncludesSubdomains</key>
            <true/>
            <key>NSExceptionAllowsInsecureHTTPLoads</key>
            <true/>
        </dict>
    </dict>
</dict>
```

### Unity Ads

```xml
<key>NSAppTransportSecurity</key>
<dict>
    <key>NSAllowsArbitraryLoadsInWebContent</key>
    <true/>
    <key>NSExceptionDomains</key>
    <dict>
        <key>unity3d.com</key>
        <dict>
            <key>NSIncludesSubdomains</key>
            <true/>
            <key>NSExceptionAllowsInsecureHTTPLoads</key>
            <true/>
        </dict>
        <key>unityads.unity3d.com</key>
        <dict>
            <key>NSIncludesSubdomains</key>
            <true/>
            <key>NSExceptionAllowsInsecureHTTPLoads</key>
            <true/>
        </dict>
    </dict>
</dict>
```

---

## Consolidated Mediation Configuration

For apps using multiple ad networks:

```xml
<key>NSAppTransportSecurity</key>
<dict>
    <!-- Required for WebView-based ads -->
    <key>NSAllowsArbitraryLoadsInWebContent</key>
    <true/>
    
    <!-- Required for video ads -->
    <key>NSAllowsArbitraryLoadsForMedia</key>
    <true/>
    
    <!-- Domain exceptions for ad networks -->
    <key>NSExceptionDomains</key>
    <dict>
        <!-- Google -->
        <key>google.com</key>
        <dict>
            <key>NSIncludesSubdomains</key>
            <true/>
            <key>NSExceptionAllowsInsecureHTTPLoads</key>
            <true/>
        </dict>
        <key>googlesyndication.com</key>
        <dict>
            <key>NSIncludesSubdomains</key>
            <true/>
            <key>NSExceptionAllowsInsecureHTTPLoads</key>
            <true/>
        </dict>
        <key>googleadservices.com</key>
        <dict>
            <key>NSIncludesSubdomains</key>
            <true/>
            <key>NSExceptionAllowsInsecureHTTPLoads</key>
            <true/>
        </dict>
        <key>doubleclick.net</key>
        <dict>
            <key>NSIncludesSubdomains</key>
            <true/>
            <key>NSExceptionAllowsInsecureHTTPLoads</key>
            <true/>
        </dict>
        
        <!-- Facebook -->
        <key>facebook.com</key>
        <dict>
            <key>NSIncludesSubdomains</key>
            <true/>
            <key>NSExceptionAllowsInsecureHTTPLoads</key>
            <true/>
        </dict>
        <key>fbcdn.net</key>
        <dict>
            <key>NSIncludesSubdomains</key>
            <true/>
            <key>NSExceptionAllowsInsecureHTTPLoads</key>
            <true/>
        </dict>
        
        <!-- Unity -->
        <key>unity3d.com</key>
        <dict>
            <key>NSIncludesSubdomains</key>
            <true/>
            <key>NSExceptionAllowsInsecureHTTPLoads</key>
            <true/>
        </dict>
        
        <!-- AppLovin -->
        <key>applovin.com</key>
        <dict>
            <key>NSIncludesSubdomains</key>
            <true/>
            <key>NSExceptionAllowsInsecureHTTPLoads</key>
            <true/>
        </dict>
        
        <!-- Vungle -->
        <key>vungle.com</key>
        <dict>
            <key>NSIncludesSubdomains</key>
            <true/>
            <key>NSExceptionAllowsInsecureHTTPLoads</key>
            <true/>
        </dict>
        
        <!-- IronSource -->
        <key>ironsrc.com</key>
        <dict>
            <key>NSIncludesSubdomains</key>
            <true/>
            <key>NSExceptionAllowsInsecureHTTPLoads</key>
            <true/>
        </dict>
        
        <!-- CDNs commonly used by ads -->
        <key>akamaihd.net</key>
        <dict>
            <key>NSIncludesSubdomains</key>
            <true/>
            <key>NSExceptionAllowsInsecureHTTPLoads</key>
            <true/>
        </dict>
        <key>cloudfront.net</key>
        <dict>
            <key>NSIncludesSubdomains</key>
            <true/>
            <key>NSExceptionAllowsInsecureHTTPLoads</key>
            <true/>
        </dict>
    </dict>
</dict>
```

---

## App Store Review Considerations

Apple requires justification for ATS exceptions. Include this in your App Review notes:

> **ATS Exception Justification:**
> Our app uses third-party advertising SDKs for monetization. These SDKs load ads from various advertising networks that may serve content over HTTP. The `NSAllowsArbitraryLoadsInWebContent` exception is required to display ads within WKWebView. Domain-specific exceptions are configured for our advertising partners (Google AdMob, Facebook Audience Network, Unity Ads, etc.) to ensure proper ad delivery and user experience.

---

## Checking ATS Status Programmatically

```swift
import Foundation

class ATSChecker {
    
    /// Check if ATS allows arbitrary loads
    static func allowsArbitraryLoads() -> Bool {
        guard let ats = Bundle.main.infoDictionary?["NSAppTransportSecurity"] as? [String: Any] else {
            return false
        }
        return ats["NSAllowsArbitraryLoads"] as? Bool ?? false
    }
    
    /// Check if ATS allows arbitrary loads in web content
    static func allowsArbitraryLoadsInWebContent() -> Bool {
        guard let ats = Bundle.main.infoDictionary?["NSAppTransportSecurity"] as? [String: Any] else {
            return false
        }
        return ats["NSAllowsArbitraryLoadsInWebContent"] as? Bool ?? false
    }
    
    /// Check if a domain has an exception
    static func hasDomainException(for domain: String) -> Bool {
        guard let ats = Bundle.main.infoDictionary?["NSAppTransportSecurity"] as? [String: Any],
              let exceptions = ats["NSExceptionDomains"] as? [String: Any] else {
            return false
        }
        return exceptions[domain] != nil
    }
    
    /// Log ATS configuration for debugging
    static func logConfiguration() {
        print("=== ATS Configuration ===")
        print("Allows Arbitrary Loads: \(allowsArbitraryLoads())")
        print("Allows Arbitrary Loads In Web Content: \(allowsArbitraryLoadsInWebContent())")
        
        if let ats = Bundle.main.infoDictionary?["NSAppTransportSecurity"] as? [String: Any],
           let exceptions = ats["NSExceptionDomains"] as? [String: Any] {
            print("Exception Domains: \(exceptions.keys.joined(separator: ", "))")
        }
    }
}
```

---

## Common Issues

### Issue 1: Ads Not Loading

**Symptom**: Blank ad slots, network errors in console

**Console Error**: 
```
App Transport Security has blocked a cleartext HTTP resource load since it is insecure
```

**Solution**: Add `NSAllowsArbitraryLoadsInWebContent` and domain exceptions

### Issue 2: Video Ads Failing

**Symptom**: Video ads show loading indicator but never play

**Solution**: Add `NSAllowsArbitraryLoadsForMedia` to your ATS configuration

### Issue 3: Mediation Fallback Not Working

**Symptom**: Primary ad network works, but fallback networks don't

**Solution**: Ensure all ad networks in your waterfall have proper domain exceptions

---

## Testing ATS Configuration

```bash
# View ATS errors in Console
xcrun simctl spawn booted log stream --predicate 'subsystem contains "com.apple.WebKit"' --level debug

# Test URL loading with nscurl
nscurl --ats-diagnostics https://googleads.g.doubleclick.net
```

---

## Related Documentation

- [Partner SDK Threading](./PARTNER_SDK_THREADING.md)
- [iOS SKAdNetwork Setup](./SKADNETWORK_SETUP.md)
- [Apple ATS Documentation](https://developer.apple.com/documentation/security/preventing_insecure_network_connections)
