'use client';

// Reference: Design.md § "Dashboard Pages" & WEBSITE_DESIGN.md § "Revenue Page"
// Revenue dashboard showing earnings, charts, and payout information

import {
    ArrowTrendingUpIcon,
    BanknotesIcon,
    ChartBarIcon,
    CurrencyDollarIcon,
} from '@heroicons/react/24/outline';
import { useState } from 'react';

export default function RevenuePage() {
  const [timeRange, setTimeRange] = useState<'today' | 'week' | 'month' | 'year'>('week');

  // Mock data - in production, this would come from an API
  const stats = {
    today: { revenue: 1247.32, impressions: 89432, ecpm: 13.95, change: +8.3 },
    week: { revenue: 8934.18, impressions: 623847, ecpm: 14.32, change: +12.5 },
    month: { revenue: 34582.94, impressions: 2456789, ecpm: 14.08, change: +15.2 },
    year: { revenue: 387294.43, impressions: 28934567, ecpm: 13.38, change: +24.7 },
  };

  const currentStats = stats[timeRange];

  return (
    <div className="p-6 space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-h2-sm font-bold uppercase text-primary-blue tracking-tight">
            Revenue Dashboard
          </h1>
          <p className="text-sm text-gray-600 mt-1">
            Track your earnings and optimize your monetization strategy
          </p>
        </div>
        <div className="flex gap-2">
          {(['today', 'week', 'month', 'year'] as const).map((range) => (
            <button
              key={range}
              onClick={() => setTimeRange(range)}
              className={`px-4 py-2 text-sm font-bold uppercase rounded ${
                timeRange === range
                  ? 'bg-sunshine-yellow text-primary-blue'
                  : 'bg-white text-gray-600 border border-gray-300 hover:border-primary-blue'
              }`}
            >
              {range}
            </button>
          ))}
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          title="Total Revenue"
          value={`$${currentStats.revenue.toLocaleString()}`}
          change={currentStats.change}
          icon={CurrencyDollarIcon}
          color="yellow"
        />
        <StatCard
          title="Impressions"
          value={currentStats.impressions.toLocaleString()}
          change={currentStats.change - 2}
          icon={ChartBarIcon}
          color="blue"
        />
        <StatCard
          title="eCPM"
          value={`$${currentStats.ecpm.toFixed(2)}`}
          change={currentStats.change + 1.2}
          icon={ArrowTrendingUpIcon}
          color="yellow"
        />
        <StatCard
          title="Next Payout"
          value="$8,934.18"
          subtitle="Friday, Nov 8"
          icon={BanknotesIcon}
          color="blue"
        />
      </div>

      {/* Revenue Chart */}
      <div className="card-blue p-6">
        <h2 className="text-sunshine-yellow font-bold uppercase text-lg mb-6">
          Revenue Trend
        </h2>
        <div className="h-64 flex items-end justify-between gap-2">
          {/* Mock bar chart */}
          {[65, 78, 82, 91, 88, 95, 100].map((height, index) => (
            <div key={index} className="flex-1 flex flex-col items-center gap-2">
              <div
                className="w-full bg-sunshine-yellow rounded-t transition-all hover:opacity-80"
                style={{ height: `${height}%` }}
              />
              <span className="text-xs text-white font-bold">
                {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][index]}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Top Performing Apps & Networks */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* Top Apps */}
        <div className="card p-6">
          <h2 className="text-primary-blue font-bold uppercase text-lg mb-4 border-b-2 border-sunshine-yellow pb-2">
            Top Performing Apps
          </h2>
          <div className="space-y-3">
            <AppRevenueItem
              name="Puzzle Quest Pro"
              revenue={3247.82}
              percentage={36.3}
              impressions={234567}
            />
            <AppRevenueItem
              name="Racing Thunder"
              revenue={2183.45}
              percentage={24.4}
              impressions={156789}
            />
            <AppRevenueItem
              name="Word Master"
              revenue={1892.34}
              percentage={21.2}
              impressions={134567}
            />
            <AppRevenueItem
              name="Casual Slots"
              revenue={1610.57}
              percentage={18.1}
              impressions={112345}
            />
          </div>
        </div>

        {/* Top Networks */}
        <div className="card p-6">
          <h2 className="text-primary-blue font-bold uppercase text-lg mb-4 border-b-2 border-sunshine-yellow pb-2">
            Top Ad Networks
          </h2>
          <div className="space-y-3">
            <NetworkRevenueItem
              name="Google AdMob"
              revenue={4234.12}
              percentage={47.4}
              ecpm={14.82}
            />
            <NetworkRevenueItem
              name="Meta Audience Network"
              revenue={2145.67}
              percentage={24.0}
              ecpm={13.45}
            />
            <NetworkRevenueItem
              name="Unity Ads"
              revenue={1523.89}
              percentage={17.1}
              ecpm={12.98}
            />
            <NetworkRevenueItem
              name="AppLovin"
              revenue={1030.50}
              percentage={11.5}
              ecpm={11.23}
            />
          </div>
        </div>
      </div>

      {/* Payout Information */}
      <div className="card-blue p-6">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-sunshine-yellow font-bold uppercase text-lg mb-2">
              Next Payout Schedule
            </h2>
            <p className="text-white text-body mb-4">
              Your next payout of <span className="font-bold text-sunshine-yellow">$8,934.18</span> is
              scheduled for <span className="font-bold">Friday, November 8, 2025</span>
            </p>
            <div className="space-y-2 text-sm text-white">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-sunshine-yellow rounded-full" />
                <span>Minimum threshold: $100 (Premium: $0)</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-sunshine-yellow rounded-full" />
                <span>Payment method: Bank Transfer (USD)</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-sunshine-yellow rounded-full" />
                <span>Processing time: 2-3 business days</span>
              </div>
            </div>
          </div>
          <a
            href="/dashboard/settings?tab=payouts"
            className="btn-primary-yellow px-6 py-2 text-sm"
          >
            Update Settings
          </a>
        </div>
      </div>
    </div>
  );
}

interface StatCardProps {
  title: string;
  value: string;
  change?: number;
  subtitle?: string;
  icon: React.ComponentType<{ className?: string }>;
  color: 'yellow' | 'blue';
}

function StatCard({ title, value, change, subtitle, icon: Icon, color }: StatCardProps) {
  const bgColor = color === 'yellow' ? 'bg-sunshine-yellow' : 'bg-primary-blue';
  const textColor = color === 'yellow' ? 'text-primary-blue' : 'text-sunshine-yellow';

  return (
    <div className="card p-6">
      <div className="flex items-start justify-between mb-4">
        <div>
          <p className="text-sm text-gray-600 font-medium uppercase">{title}</p>
          <h3 className="text-2xl font-bold text-primary-blue mt-1">{value}</h3>
          {subtitle && <p className="text-xs text-gray-500 mt-1">{subtitle}</p>}
        </div>
        <div className={`${bgColor} ${textColor} p-3 rounded`}>
          <Icon className="w-6 h-6" />
        </div>
      </div>
      {change !== undefined && (
        <div className="flex items-center gap-1 text-sm">
          <span className={change >= 0 ? 'text-green-600' : 'text-red-600'}>
            {change >= 0 ? '↑' : '↓'} {Math.abs(change).toFixed(1)}%
          </span>
          <span className="text-gray-500">vs last period</span>
        </div>
      )}
    </div>
  );
}

interface AppRevenueItemProps {
  name: string;
  revenue: number;
  percentage: number;
  impressions: number;
}

function AppRevenueItem({ name, revenue, percentage, impressions }: AppRevenueItemProps) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
      <div className="flex-1">
        <p className="font-bold text-primary-blue">{name}</p>
        <p className="text-xs text-gray-500">{impressions.toLocaleString()} impressions</p>
      </div>
      <div className="text-right">
        <p className="font-bold text-primary-blue">${revenue.toLocaleString()}</p>
        <p className="text-xs text-gray-500">{percentage}%</p>
      </div>
    </div>
  );
}

interface NetworkRevenueItemProps {
  name: string;
  revenue: number;
  percentage: number;
  ecpm: number;
}

function NetworkRevenueItem({ name, revenue, percentage, ecpm }: NetworkRevenueItemProps) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
      <div className="flex-1">
        <p className="font-bold text-primary-blue">{name}</p>
        <p className="text-xs text-gray-500">eCPM: ${ecpm.toFixed(2)}</p>
      </div>
      <div className="text-right">
        <p className="font-bold text-primary-blue">${revenue.toLocaleString()}</p>
        <p className="text-xs text-gray-500">{percentage}%</p>
      </div>
    </div>
  );
}
