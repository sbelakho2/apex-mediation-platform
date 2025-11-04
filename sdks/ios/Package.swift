// swift-tools-version:5.9
import PackageDescription

let package = Package(
    name: "ApexMediation",
    platforms: [
        .iOS(.v12)
    ],
    products: [
        .library(
            name: "ApexMediation",
            targets: ["ApexMediation"]
        )
    ],
    targets: [
        .target(
            name: "ApexMediation",
            dependencies: []
        ),
        .testTarget(
            name: "ApexMediationTests",
            dependencies: ["ApexMediation"]
        )
    ]
)
