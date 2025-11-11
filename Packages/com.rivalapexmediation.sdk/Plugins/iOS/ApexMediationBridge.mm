#import <Foundation/Foundation.h>
#import <AdSupport/AdSupport.h>
#import <AppTrackingTransparency/AppTrackingTransparency.h>

// Get IDFV (Identifier for Vendor)
extern "C" const char* _ApexGetIDFV() {
    NSString *idfv = [[[UIDevice currentDevice] identifierForVendor] UUIDString];
    if (idfv == nil) {
        return strdup("unknown");
    }
    return strdup([idfv UTF8String]);
}

// Get IDFA (Identifier for Advertisers) - requires ATT authorization
extern "C" const char* _ApexGetIDFA() {
    if (@available(iOS 14, *)) {
        // Check ATT status first
        ATTrackingManagerAuthorizationStatus status = [ATTrackingManager trackingAuthorizationStatus];
        if (status == ATTrackingManagerAuthorizationStatusAuthorized) {
            NSString *idfa = [[[ASIdentifierManager sharedManager] advertisingIdentifier] UUIDString];
            return strdup([idfa UTF8String]);
        } else {
            // Return all zeros if not authorized
            return strdup("00000000-0000-0000-0000-000000000000");
        }
    } else {
        // iOS < 14, use old API
        NSString *idfa = [[[ASIdentifierManager sharedManager] advertisingIdentifier] UUIDString];
        return strdup([idfa UTF8String]);
    }
}

// Get ATT (App Tracking Transparency) status
// Returns: 0=notDetermined, 1=restricted, 2=denied, 3=authorized
extern "C" int _ApexGetATTStatus() {
    if (@available(iOS 14, *)) {
        return (int)[ATTrackingManager trackingAuthorizationStatus];
    } else {
        // iOS < 14, always return authorized
        return 3;
    }
}

// Request ATT authorization (async)
extern "C" void _ApexRequestATTAuthorization(void (*callback)(int status)) {
    if (@available(iOS 14, *)) {
        [ATTrackingManager requestTrackingAuthorizationWithCompletionHandler:^(ATTrackingManagerAuthorizationStatus status) {
            dispatch_async(dispatch_get_main_queue(), ^{
                callback((int)status);
            });
        }];
    } else {
        // iOS < 14, immediately return authorized
        callback(3);
    }
}

// Open URL in Safari
extern "C" void _ApexOpenURL(const char* url) {
    NSString *urlString = [NSString stringWithUTF8String:url];
    NSURL *nsUrl = [NSURL URLWithString:urlString];
    if (nsUrl != nil) {
        [[UIApplication sharedApplication] openURL:nsUrl options:@{} completionHandler:nil];
    }
}
