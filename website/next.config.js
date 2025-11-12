/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,

  // Environment variables exposed to the browser
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || 'https://api.apexmediation.ee/v1',
    NEXT_PUBLIC_CONSOLE_URL: process.env.NEXT_PUBLIC_CONSOLE_URL || 'https://console.apexmediation.ee',
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL || 'https://apexmediation.bel-consulting.ee',
  },

  // Image optimization
  images: {
    domains: ['cdn.apexmediation.ee', 'images.unsplash.com'],
    formats: ['image/avif', 'image/webp'],
  },

  // Internationalization
  i18n: {
    locales: ['en', 'et'],
    defaultLocale: 'en',
  },

  // Headers for security and performance
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          // Security headers
          {
            key: 'X-DNS-Prefetch-Control',
            value: 'on'
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload'
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff'
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY'
          },
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block'
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin'
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()'
          },
          {
            // NOTE: Prefer nonce-based CSP for any inline usage; avoid inline scripts/styles.
            // Adjust connect-src/img-src/font-src as needed for CDNs.
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "base-uri 'self'",
              "frame-ancestors 'none'",
              // Allow images and media from self and our CDN
              "img-src 'self' data: https:",
              // Style from self; allow 'unsafe-inline' only if strictly necessary (prefer hashed/nonce styles)
              "style-src 'self' 'unsafe-inline'",
              // Scripts from self; avoid inline scripts. If inline is unavoidable, switch to nonce-based in middleware.
              "script-src 'self'",
              // XHR/WebSocket endpoints
              "connect-src 'self' https:",
              // Fonts
              "font-src 'self' data:",
            ].join('; ')
          }
        ]
      }
    ];
  },

  // Redirects
  async redirects() {
    return [
      {
        source: '/docs',
        destination: '/documentation',
        permanent: true,
      },
      {
        source: '/login',
        destination: '/signin',
        permanent: false,
      }
    ];
  },

  // Webpack configuration
  webpack: (config, { isServer }) => {
    // Bundle analyzer
    if (process.env.ANALYZE === 'true') {
      const { BundleAnalyzerPlugin } = require('@next/bundle-analyzer')();
      config.plugins.push(
        new BundleAnalyzerPlugin({
          analyzerMode: 'static',
          reportFilename: isServer
            ? '../analyze/server.html'
            : './analyze/client.html',
        })
      );
    }

    return config;
  },

  // Experimental features
  experimental: {
    optimizeCss: true,
    optimizePackageImports: ['react-icons', 'framer-motion'],
  },
};

module.exports = nextConfig;
