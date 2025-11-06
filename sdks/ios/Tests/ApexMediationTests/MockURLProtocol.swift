import Foundation

final class MockURLProtocol: URLProtocol {
    // Control how this protocol responds
    static var response: HTTPURLResponse?
    static var responseData: Data? = nil
    static var error: Error? = nil
    static var responseDelay: TimeInterval = 0

    override class func canInit(with request: URLRequest) -> Bool {
        return true
    }

    override class func canonicalRequest(for request: URLRequest) -> URLRequest {
        return request
    }

    override func startLoading() {
        if let error = MockURLProtocol.error {
            // Simulate error immediately
            client?.urlProtocol(self, didFailWithError: error)
            return
        }
        let send: () -> Void = { [weak self] in
            guard let self = self else { return }
            if let resp = MockURLProtocol.response {
                self.client?.urlProtocol(self, didReceive: resp, cacheStoragePolicy: .notAllowed)
            }
            if let data = MockURLProtocol.responseData {
                self.client?.urlProtocol(self, didLoad: data)
            }
            self.client?.urlProtocolDidFinishLoading(self)
        }
        if MockURLProtocol.responseDelay > 0 {
            DispatchQueue.global().asyncAfter(deadline: .now() + MockURLProtocol.responseDelay, execute: send)
        } else {
            send()
        }
    }

    override func stopLoading() {
        // no-op
    }

    // Helpers for tests
    static func reset() {
        response = nil
        responseData = nil
        error = nil
        responseDelay = 0
    }
}