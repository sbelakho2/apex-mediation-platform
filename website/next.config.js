/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  
  // Use src directory for app and pages + other experimental flags
  experimental: {
    appDir: true,
    optimizeCss: false,
    optimizePackageImports: ['react-icons', 'framer-motion'],
  },
  
  // Specify that we're using src/ directory
  pageExtensions: ['tsx', 'ts', 'jsx', 'js'],

  // Environment variables exposed to the browser (marketing site; keep minimal)
  // NOTE: For sensitive values prefer server env or middleware. Consider moving to runtime env at deploy time.
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || 'https://api.apexmediation.ee/v1',
    NEXT_PUBLIC_CONSOLE_URL: process.env.NEXT_PUBLIC_CONSOLE_URL || 'https://console.apexmediation.ee',
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL || 'https://apexmediation.bel-consulting.ee',
    NEXT_PUBLIC_ENABLE_GA: process.env.NEXT_PUBLIC_ENABLE_GA || 'false',
    NEXT_PUBLIC_ENABLE_HOTJAR: process.env.NEXT_PUBLIC_ENABLE_HOTJAR || 'false',
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
    // Derive optional analytics hosts conditionally (GA / Hotjar disabled by default)
    const enableGA = process.env.NEXT_PUBLIC_ENABLE_GA === 'true'
    const enableHotjar = process.env.NEXT_PUBLIC_ENABLE_HOTJAR === 'true'

    const scriptSrc = ["'self'"]
    const connectSrc = ["'self'", 'https:']
    const imgSrc = ["'self'", 'data:', 'https:']

    if (enableGA) {
      scriptSrc.push('https://www.googletagmanager.com', 'https://www.google-analytics.com')
      connectSrc.push('https://www.google-analytics.com', 'https://region1.google-analytics.com')
      imgSrc.push('https://www.google-analytics.com')
    }
    if (enableHotjar) {
      scriptSrc.push('https://static.hotjar.com', 'https://script.hotjar.com')
      connectSrc.push('https://*.hotjar.com')
    }

    // NOTE: Prefer nonce-based CSP for any inline usage; avoid inline styles/scripts where possible.
    // A future improvement can attach nonces per request via middleware.
    const cspDirectives = [
      "default-src 'self'",
      "base-uri 'self'",
      "frame-ancestors 'none'",
      // Disallow all plugins/objects explicitly
      "object-src 'none'",
      `img-src ${imgSrc.join(' ')}`,
      // Style: allow inline only if necessary; prefer CSS files or hashed/nonce styles
      "style-src 'self' 'unsafe-inline'",
      `script-src ${scriptSrc.join(' ')}`,
      `connect-src ${connectSrc.join(' ')}`,
      "font-src 'self' data:",
    ]

    // In production, optionally upgrade insecure requests to https
    if (process.env.NODE_ENV === 'production') {
      cspDirectives.push('upgrade-insecure-requests')
    }

    const csp = cspDirectives.join('; ')

    return [
      {
        source: '/:path*',
        headers: [
          // Security headers
          { key: 'X-DNS-Prefetch-Control', value: 'on' },
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          { key: 'Content-Security-Policy', value: csp },
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

  // Experimental features merged above
};

module.exports = nextConfig;
