// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "ApexAdapterDevKit",
    platforms: [
        .iOS(.v14), .tvOS(.v14)
    ],
    products: [
        .library(name: "ApexAdapterDevKit", targets: ["ApexAdapterDevKit"]),
        .executable(name: "apex-adapter-runner", targets: ["apex-adapter-runner"]),
    ],
    dependencies: [
        // Local dependency on the core SDK to access the AdNetworkAdapter protocol and APIs
        .package(path: "../../core/ios")
    ],
    targets: [
        .target(
            name: "ApexAdapterDevKit",
            dependencies: [
                .product(name: "RivalApexMediationSDK", package: "ios")
            ],
            path: "Sources/ApexAdapterDevKit"
        ),
        .executableTarget(
            name: "apex-adapter-runner",
            dependencies: ["ApexAdapterDevKit"],
            path: "Sources/apex-adapter-runner"
        ),
        .testTarget(
            name: "ApexAdapterDevKitTests",
            dependencies: ["ApexAdapterDevKit"],
            path: "Tests/ApexAdapterDevKitTests"
        ),
    ]
)
