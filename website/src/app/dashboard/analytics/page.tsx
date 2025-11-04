'use client';

// Reference: Design.md § "Dashboard Pages" & WEBSITE_DESIGN.md § "Analytics Page"
// Analytics dashboard with comprehensive metrics and insights

import {
    ArrowPathIcon,
    ChartPieIcon,
    ClockIcon,
    DevicePhoneMobileIcon,
    GlobeAltIcon,
    UsersIcon,
} from '@heroicons/react/24/outline';
import { useState } from 'react';

export default function AnalyticsPage() {
  const [timeRange, setTimeRange] = useState<'today' | 'week' | 'month'>('week');

  return (
    <div className="p-6 space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-h2-sm font-bold uppercase text-primary-blue tracking-tight">
            Analytics Dashboard
          </h1>
          <p className="text-sm text-gray-600 mt-1">
            Comprehensive insights into your ad performance and user engagement
          </p>
        </div>
        <div className="flex gap-2">
          {(['today', 'week', 'month'] as const).map((range) => (
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

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <MetricCard
          title="Total Users"
          value="234,567"
          change={+12.3}
          icon={UsersIcon}
          trend={[45, 52, 48, 61, 58, 67, 72]}
        />
        <MetricCard
          title="Avg Session Duration"
          value="8m 34s"
          change={+5.7}
          icon={ClockIcon}
          trend={[62, 58, 65, 63, 70, 68, 72]}
        />
        <MetricCard
          title="Click-Through Rate"
          value="3.42%"
          change={-1.2}
          icon={ArrowPathIcon}
          trend={[58, 62, 59, 55, 52, 50, 48]}
        />
        <MetricCard
          title="Fill Rate"
          value="97.8%"
          change={+2.1}
          icon={ChartPieIcon}
          trend={[82, 85, 88, 90, 93, 95, 98]}
        />
        <MetricCard
          title="DAU/MAU Ratio"
          value="42.3%"
          change={+3.4}
          icon={DevicePhoneMobileIcon}
          trend={[35, 37, 39, 40, 41, 42, 42]}
        />
        <MetricCard
          title="Requests"
          value="1.2M"
          change={+18.9}
          icon={GlobeAltIcon}
          trend={[65, 70, 75, 82, 88, 95, 100]}
        />
      </div>

      {/* User Engagement Funnel */}
      <div className="card-blue p-6">
        <h2 className="text-sunshine-yellow font-bold uppercase text-lg mb-6">
          User Engagement Funnel
        </h2>
        <div className="space-y-4">
          <FunnelStep label="App Opens" value={234567} percentage={100} />
          <FunnelStep label="Ad Requests" value={187654} percentage={80} />
          <FunnelStep label="Ads Shown" value={183456} percentage={78.2} />
          <FunnelStep label="Ad Clicks" value={6274} percentage={2.7} />
          <FunnelStep label="Conversions" value={891} percentage={0.38} />
        </div>
      </div>

      {/* Platform & Geography Breakdown */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* Platform Distribution */}
        <div className="card p-6">
          <h2 className="text-primary-blue font-bold uppercase text-lg mb-4 border-b-2 border-sunshine-yellow pb-2">
            Platform Distribution
          </h2>
          <div className="space-y-4">
            <PlatformBar platform="iOS" percentage={58.3} users={136789} color="blue" />
            <PlatformBar platform="Android" percentage={39.7} users={93145} color="yellow" />
            <PlatformBar platform="Web" percentage={2.0} users={4633} color="blue" />
          </div>
        </div>

        {/* Top Countries */}
        <div className="card p-6">
          <h2 className="text-primary-blue font-bold uppercase text-lg mb-4 border-b-2 border-sunshine-yellow pb-2">
            Top Countries
          </h2>
          <div className="space-y-3">
            <CountryItem country="United States" flag="🇺🇸" users={89234} percentage={38.0} />
            <CountryItem country="United Kingdom" flag="🇬🇧" users={34567} percentage={14.7} />
            <CountryItem country="Germany" flag="🇩🇪" users={28901} percentage={12.3} />
            <CountryItem country="Canada" flag="🇨🇦" users={23456} percentage={10.0} />
            <CountryItem country="Australia" flag="🇦🇺" users={18234} percentage={7.8} />
            <CountryItem country="Others" flag="🌍" users={40175} percentage={17.2} />
          </div>
        </div>
      </div>

      {/* Ad Format Performance */}
      <div className="card p-6">
        <h2 className="text-primary-blue font-bold uppercase text-lg mb-4 border-b-2 border-sunshine-yellow pb-2">
          Ad Format Performance
        </h2>
        <div className="grid md:grid-cols-3 gap-6 mt-6">
          <AdFormatCard
            format="Rewarded Video"
            impressions={456789}
            ecpm={18.45}
            ctr={12.3}
            fillRate={98.2}
          />
          <AdFormatCard
            format="Interstitial"
            impressions={298456}
            ecpm={14.23}
            ctr={2.8}
            fillRate={95.7}
          />
          <AdFormatCard
            format="Banner"
            impressions={823456}
            ecpm={3.89}
            ctr={0.9}
            fillRate={99.1}
          />
        </div>
      </div>

      {/* Real-Time Activity */}
      <div className="card-blue p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sunshine-yellow font-bold uppercase text-lg">
            Real-Time Activity
          </h2>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
            <span className="text-white text-sm">Live</span>
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
          <div>
            <p className="text-sunshine-yellow text-3xl font-bold">1,247</p>
            <p className="text-white text-sm mt-1">Active Users</p>
          </div>
          <div>
            <p className="text-sunshine-yellow text-3xl font-bold">892</p>
            <p className="text-white text-sm mt-1">Impressions/min</p>
          </div>
          <div>
            <p className="text-sunshine-yellow text-3xl font-bold">$12.34</p>
            <p className="text-white text-sm mt-1">Revenue/hour</p>
          </div>
          <div>
            <p className="text-sunshine-yellow text-3xl font-bold">97.2%</p>
            <p className="text-white text-sm mt-1">Fill Rate</p>
          </div>
        </div>
      </div>
    </div>
  );
}

interface MetricCardProps {
  title: string;
  value: string;
  change: number;
  icon: React.ComponentType<{ className?: string }>;
  trend: number[];
}

function MetricCard({ title, value, change, icon: Icon, trend }: MetricCardProps) {
  return (
    <div className="card p-6">
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1">
          <p className="text-sm text-gray-600 font-medium uppercase">{title}</p>
          <h3 className="text-2xl font-bold text-primary-blue mt-1">{value}</h3>
        </div>
        <div className="bg-primary-blue text-sunshine-yellow p-3 rounded">
          <Icon className="w-6 h-6" />
        </div>
      </div>
      {/* Mini sparkline */}
      <div className="flex items-end gap-1 h-8 mb-2">
        {trend.map((height, i) => (
          <div
            key={i}
            className="flex-1 bg-sunshine-yellow rounded-t"
            style={{ height: `${height}%` }}
          />
        ))}
      </div>
      <div className="flex items-center gap-1 text-sm">
        <span className={change >= 0 ? 'text-green-600' : 'text-red-600'}>
          {change >= 0 ? '↑' : '↓'} {Math.abs(change).toFixed(1)}%
        </span>
        <span className="text-gray-500">vs last period</span>
      </div>
    </div>
  );
}

interface FunnelStepProps {
  label: string;
  value: number;
  percentage: number;
}

function FunnelStep({ label, value, percentage }: FunnelStepProps) {
  return (
    <div>
      <div className="flex items-center justify-between text-white mb-2">
        <span className="font-bold">{label}</span>
        <span>{value.toLocaleString()} ({percentage}%)</span>
      </div>
      <div className="w-full bg-primary-blue/30 h-8 rounded overflow-hidden">
        <div
          className="bg-sunshine-yellow h-full flex items-center justify-end pr-2"
          style={{ width: `${percentage}%` }}
        >
          <span className="text-primary-blue text-sm font-bold">{percentage}%</span>
        </div>
      </div>
    </div>
  );
}

interface PlatformBarProps {
  platform: string;
  percentage: number;
  users: number;
  color: 'blue' | 'yellow';
}

function PlatformBar({ platform, percentage, users, color }: PlatformBarProps) {
  const bgColor = color === 'yellow' ? 'bg-sunshine-yellow' : 'bg-primary-blue';

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="font-bold text-primary-blue">{platform}</span>
        <span className="text-sm text-gray-600">{users.toLocaleString()} users</span>
      </div>
      <div className="w-full bg-gray-200 h-6 rounded overflow-hidden">
        <div
          className={`${bgColor} h-full flex items-center justify-end pr-2`}
          style={{ width: `${percentage}%` }}
        >
          <span className="text-white text-sm font-bold">{percentage}%</span>
        </div>
      </div>
    </div>
  );
}

interface CountryItemProps {
  country: string;
  flag: string;
  users: number;
  percentage: number;
}

function CountryItem({ country, flag, users, percentage }: CountryItemProps) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
      <div className="flex items-center gap-3">
        <span className="text-2xl">{flag}</span>
        <span className="font-bold text-primary-blue">{country}</span>
      </div>
      <div className="text-right">
        <p className="font-bold text-primary-blue">{users.toLocaleString()}</p>
        <p className="text-xs text-gray-500">{percentage}%</p>
      </div>
    </div>
  );
}

interface AdFormatCardProps {
  format: string;
  impressions: number;
  ecpm: number;
  ctr: number;
  fillRate: number;
}

function AdFormatCard({ format, impressions, ecpm, ctr, fillRate }: AdFormatCardProps) {
  return (
    <div className="border-2 border-primary-blue rounded p-4">
      <h3 className="font-bold text-primary-blue text-lg mb-3">{format}</h3>
      <div className="space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-gray-600">Impressions:</span>
          <span className="font-bold text-primary-blue">{impressions.toLocaleString()}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-600">eCPM:</span>
          <span className="font-bold text-primary-blue">${ecpm.toFixed(2)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-600">CTR:</span>
          <span className="font-bold text-primary-blue">{ctr}%</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-600">Fill Rate:</span>
          <span className="font-bold text-primary-blue">{fillRate}%</span>
        </div>
      </div>
    </div>
  );
}
