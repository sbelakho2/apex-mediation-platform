# Ad Platform Console

## Overview

Modern Next.js 14 web application providing publishers with a comprehensive dashboard for ad mediation management, revenue analytics, fraud detection, and payout tracking.

## Tech Stack

- **Framework**: Next.js 14 (App Router)
- **UI**: React 18, TypeScript 5
- **Styling**: Tailwind CSS 3.3
- **State Management**: Zustand, TanStack Query (React Query)
- **Authentication**: NextAuth.js
- **Charts**: Recharts
- **Tables**: TanStack Table
- **Forms**: React Hook Form + Zod validation
- **HTTP Client**: Axios
- **Icons**: Lucide React

## Features

### Dashboard
- Real-time revenue metrics
- Impression and click statistics
- eCPM and fill rate trends
- Performance charts (daily/weekly/monthly)
- Top-performing placements and adapters

### Placement Management
- Create, edit, and delete ad placements
- Configure placement types (banner, interstitial, rewarded)
- Platform-specific settings (iOS, Android, Unity)
- Status management (active, paused, archived)

### Adapter Configuration
- Network adapter management
- Priority-based waterfall configuration
- Real-time performance metrics per adapter
- A/B testing support

### Fraud Detection
- Real-time fraud alerts dashboard
- Fraud statistics (GIVT, SIVT, ML detections)
- Pattern detection visualization
- Blocked entity management
- Trend analysis with severity indicators

### Payment & Payouts
- Payment method configuration (Stripe, PayPal, Wire)
- Payout history with status tracking
- Upcoming payout schedule
- Revenue reconciliation
- Tax documentation (1099 generation)

### Analytics
- Advanced time-series charts
- Custom date range selection
- Export capabilities (CSV, PDF)
- Cohort analysis
- Retention metrics

## Project Structure

```
console/
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── api/               # API routes
│   │   │   └── auth/         # NextAuth configuration
│   │   ├── dashboard/        # Dashboard pages
│   │   ├── placements/       # Placement management
│   │   ├── fraud/            # Fraud detection
│   │   ├── payouts/          # Payout management
│   │   ├── settings/         # Account settings
│   │   ├── layout.tsx        # Root layout
│   │   ├── page.tsx          # Home page (redirects to dashboard)
│   │   ├── providers.tsx     # Context providers
│   │   └── globals.css       # Global styles
│   ├── components/           # React components
│   │   ├── ui/              # Reusable UI components
│   │   ├── charts/          # Chart components
│   │   ├── tables/          # Table components
│   │   └── forms/           # Form components
│   ├── lib/                 # Utilities
│   │   ├── api.ts          # API client functions
│   │   ├── api-client.ts   # Axios configuration
│   │   └── utils.ts        # Helper functions
│   ├── hooks/              # Custom React hooks
│   ├── types/              # TypeScript type definitions
│   └── store/              # Zustand stores
├── public/                 # Static assets
├── package.json
├── tsconfig.json
├── tailwind.config.ts
├── next.config.js
└── README.md
```

## Getting Started

### Prerequisites

- Node.js 18+ and npm/yarn/pnpm
- Backend services running (Config, Fraud, Analytics APIs)

### Installation

```bash
# Navigate to console directory
cd console

# Install dependencies
npm install

# Copy environment variables
cp .env.local.example .env.local

# Edit .env.local with your configuration
```

### Environment Variables

Create `.env.local`:

```env
# API Configuration
NEXT_PUBLIC_API_URL=http://localhost:8080
NEXT_PUBLIC_FRAUD_API_URL=http://localhost:8083
NEXT_PUBLIC_ANALYTICS_API_URL=http://localhost:8084

# Authentication
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=your-secret-key-here

# OAuth Providers (optional)
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=
```

### Development

```bash
# Run development server
npm run dev

# Open browser to http://localhost:3000
```

### Building for Production

```bash
# Type checking
npm run type-check

# Linting
npm run lint

# Build
npm run build

# Start production server
npm start
```

## API Integration

The console integrates with multiple backend services:

### Configuration Service (Port 8080)
- `/v1/publishers/*` - Publisher management
- `/v1/placements/*` - Placement CRUD
- `/v1/adapters/*` - Adapter configuration
- `/v1/auth/*` - Authentication

### Fraud Service (Port 8083)
- `/v1/fraud/alerts/:publisherId` - Fraud alerts
- `/v1/fraud/stats/:publisherId` - Fraud statistics
- `/v1/fraud/dashboard/:publisherId` - Dashboard data
- `/v1/fraud/trend/:publisherId` - Trend analysis

### Analytics Service (Port 8084)
- `/v1/analytics/impressions` - Impression data
- `/v1/analytics/performance/:placementId` - Performance metrics
- `/v1/revenue/*` - Revenue analytics

## Authentication

Uses NextAuth.js with credential-based authentication:

1. User submits email/password
2. Credentials verified against backend API (`/v1/auth/login`)
3. JWT token stored in session
4. Token included in all API requests via Axios interceptors

### Protected Routes

All routes except `/login` require authentication. Unauthenticated users are redirected to login page.

## Styling

### Tailwind Utilities

Custom component classes defined in `globals.css`:

```css
.btn              # Base button
.btn-primary      # Primary button (blue)
.btn-secondary    # Secondary button (gray)
.btn-success      # Success button (green)
.btn-danger       # Danger button (red)
.btn-outline      # Outlined button

.card             # Card container
.input            # Form input
.label            # Form label

.badge            # Badge base
.badge-success    # Success badge
.badge-warning    # Warning badge
.badge-danger     # Danger badge
.badge-info       # Info badge
```

### Custom Colors

Extended Tailwind palette:
- `primary-*` (blue shades)
- `success-*` (green shades)
- `warning-*` (yellow shades)
- `danger-*` (red shades)

## Components (To Be Built)

### UI Components
- `Button` - Reusable button component
- `Card` - Card container
- `Table` - Data table with sorting/filtering
- `Modal` - Modal dialog
- `Badge` - Status badge
- `Spinner` - Loading indicator
- `Alert` - Alert/notification

### Charts
- `LineChart` - Time series revenue
- `BarChart` - Comparison charts
- `PieChart` - Distribution charts
- `AreaChart` - Trend analysis

### Forms
- `PlacementForm` - Create/edit placement
- `AdapterForm` - Configure adapter
- `PaymentMethodForm` - Update payment info

### Dashboard Widgets
- `RevenueCard` - Revenue summary
- `MetricsCard` - Key metrics (impressions, clicks, eCPM)
- `FraudAlerts` - Recent fraud alerts
- `TopPlacements` - Best performing placements

## Data Flow

1. **Query**: Components use TanStack Query hooks
2. **API Call**: Query functions call API endpoints via `lib/api.ts`
3. **HTTP**: Axios client (`lib/api-client.ts`) sends requests
4. **Interceptors**: Add auth token, handle errors
5. **Response**: Data returned to component
6. **Cache**: TanStack Query caches results (1 minute stale time)
7. **UI Update**: Component re-renders with new data

## Error Handling

- API errors caught by Axios interceptors
- 401 errors trigger logout and redirect to login
- User-friendly error messages displayed via toast notifications
- Form validation via Zod schemas

## Performance Optimizations

- Server-side rendering for initial page load
- Automatic code splitting (Next.js)
- Image optimization (next/image)
- React Query caching (1 minute default)
- Debounced search inputs
- Lazy loading for charts and heavy components

## Security

- CSRF protection via NextAuth
- HTTP-only cookies for session tokens
- XSS protection (React auto-escaping)
- Input validation (Zod schemas)
- Secure API communication (HTTPS in production)

## Deployment

### Vercel (Recommended)

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel
```

### Docker

```bash
# Build image
docker build -t ad-platform-console .

# Run container
docker run -p 3000:3000 ad-platform-console
```

### Manual Deployment

```bash
# Build
npm run build

# Start
npm start
```

## Browser Support

- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

## Future Enhancements

1. **Real-time Updates**: WebSocket integration for live metrics
2. **Advanced Filters**: Complex filtering UI for all tables
3. **Report Scheduling**: Automated email reports
4. **Multi-language**: i18n support
5. **Dark Mode**: Theme switcher
6. **Mobile App**: React Native companion app
7. **Export Features**: PDF/Excel report generation
8. **Custom Dashboards**: Drag-and-drop dashboard builder
9. **Alerts**: Push notifications for critical events
10. **Admin Panel**: Multi-publisher management for platform admins

## License

Proprietary - All rights reserved

## Support

For issues or questions, contact: support@adplatform.com
