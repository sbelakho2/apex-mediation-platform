'use client';

// Reference: Design.md § "Dashboard Pages" & WEBSITE_DESIGN.md § "Fraud Detection Page"
// ML-powered fraud detection dashboard with real-time monitoring

import {
    CheckCircleIcon,
    ExclamationTriangleIcon,
    ShieldCheckIcon,
    XCircleIcon,
} from '@heroicons/react/24/outline';
import { useState } from 'react';

interface FraudEvent {
  id: string;
  timestamp: string;
  type: 'click_fraud' | 'install_fraud' | 'bot_traffic' | 'vpn_abuse';
  severity: 'high' | 'medium' | 'low';
  ip: string;
  country: string;
  blocked: boolean;
  details: string;
}

export default function FraudPage() {
  const [timeRange, setTimeRange] = useState<'today' | 'week' | 'month'>('today');

  const fraudEvents: FraudEvent[] = [
    {
      id: '1',
      timestamp: '2 minutes ago',
      type: 'click_fraud',
      severity: 'high',
      ip: '192.168.1.45',
      country: '🇷🇺 Russia',
      blocked: true,
      details: 'Suspicious click pattern detected: 47 clicks in 3 seconds',
    },
    {
      id: '2',
      timestamp: '8 minutes ago',
      type: 'bot_traffic',
      severity: 'high',
      ip: '203.45.67.89',
      country: '🇨🇳 China',
      blocked: true,
      details: 'Bot signature matched: User-Agent spoofing detected',
    },
    {
      id: '3',
      timestamp: '15 minutes ago',
      type: 'vpn_abuse',
      severity: 'medium',
      ip: '10.23.45.67',
      country: '🇳🇱 Netherlands',
      blocked: true,
      details: 'VPN/proxy detected with suspicious engagement patterns',
    },
    {
      id: '4',
      timestamp: '23 minutes ago',
      type: 'install_fraud',
      severity: 'high',
      ip: '45.67.89.12',
      country: '🇻🇳 Vietnam',
      blocked: true,
      details: 'Install farm detected: 23 installs from same device ID',
    },
    {
      id: '5',
      timestamp: '35 minutes ago',
      type: 'click_fraud',
      severity: 'low',
      ip: '123.45.67.89',
      country: '🇮🇳 India',
      blocked: false,
      details: 'Suspicious but below threshold: Manual review recommended',
    },
  ];

  return (
    <div className="p-6 space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-h2-sm font-bold uppercase text-primary-blue tracking-tight">
            Fraud Detection
          </h1>
          <p className="text-sm text-gray-600 mt-1">
            ML-powered fraud protection • 99.7% accuracy • {'<'}5ms latency
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

      {/* ML Model Stats */}
      <div className="card-blue p-6">
        <div className="flex items-center gap-3 mb-6">
          <ShieldCheckIcon className="w-8 h-8 text-sunshine-yellow" />
          <div>
            <h2 className="text-sunshine-yellow font-bold uppercase text-lg">
              ML Model Performance
            </h2>
            <p className="text-white text-sm">Trained on 500,000+ fraud samples</p>
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          <div>
            <p className="text-sunshine-yellow text-4xl font-bold">99.7%</p>
            <p className="text-white text-sm mt-1">Detection Accuracy</p>
          </div>
          <div>
            <p className="text-sunshine-yellow text-4xl font-bold">{'<'}5ms</p>
            <p className="text-white text-sm mt-1">Inference Time</p>
          </div>
          <div>
            <p className="text-sunshine-yellow text-4xl font-bold">0.08%</p>
            <p className="text-white text-sm mt-1">False Positive Rate</p>
          </div>
          <div>
            <p className="text-sunshine-yellow text-4xl font-bold">17</p>
            <p className="text-white text-sm mt-1">Features Analyzed</p>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <StatCard
          title="Blocked Today"
          value="1,247"
          subtitle="Fraud attempts"
          color="red"
          icon={XCircleIcon}
        />
        <StatCard
          title="Money Saved"
          value="$2,438"
          subtitle="This month"
          color="yellow"
          icon={ShieldCheckIcon}
        />
        <StatCard
          title="Fraud Rate"
          value="3.2%"
          subtitle="Of total traffic"
          color="blue"
          icon={ExclamationTriangleIcon}
        />
        <StatCard
          title="Clean Requests"
          value="38,421"
          subtitle="Passed verification"
          color="green"
          icon={CheckCircleIcon}
        />
      </div>

      {/* Fraud Type Breakdown */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* Fraud Types */}
        <div className="card p-6">
          <h2 className="text-primary-blue font-bold uppercase text-lg mb-4 border-b-2 border-sunshine-yellow pb-2">
            Fraud Type Breakdown
          </h2>
          <div className="space-y-4">
            <FraudTypeBar type="Click Fraud" count={547} percentage={43.9} color="red" />
            <FraudTypeBar type="Bot Traffic" count={389} percentage={31.2} color="yellow" />
            <FraudTypeBar type="Install Fraud" count={203} percentage={16.3} color="blue" />
            <FraudTypeBar type="VPN Abuse" count={108} percentage={8.6} color="gray" />
          </div>
        </div>

        {/* Top Blocked Countries */}
        <div className="card p-6">
          <h2 className="text-primary-blue font-bold uppercase text-lg mb-4 border-b-2 border-sunshine-yellow pb-2">
            Top Blocked Countries
          </h2>
          <div className="space-y-3">
            <CountryBlock country="Russia" flag="🇷🇺" blocked={324} percentage={26.0} />
            <CountryBlock country="China" flag="🇨🇳" blocked={267} percentage={21.4} />
            <CountryBlock country="Vietnam" flag="🇻🇳" blocked={189} percentage={15.2} />
            <CountryBlock country="India" flag="🇮🇳" blocked={156} percentage={12.5} />
            <CountryBlock country="Others" flag="🌍" blocked={311} percentage={24.9} />
          </div>
        </div>
      </div>

      {/* Recent Fraud Events Timeline */}
      <div className="card p-6">
        <h2 className="text-primary-blue font-bold uppercase text-lg mb-6 border-b-2 border-sunshine-yellow pb-2">
          Recent Fraud Events
        </h2>
        <div className="space-y-4">
          {fraudEvents.map((event) => (
            <FraudEventCard key={event.id} event={event} />
          ))}
        </div>
      </div>

      {/* Model Features */}
      <div className="card-blue p-6">
        <h2 className="text-sunshine-yellow font-bold uppercase text-lg mb-4">
          ML Model Features (17 Total)
        </h2>
        <div className="grid md:grid-cols-3 gap-4 text-white text-sm">
          <div className="space-y-2">
            <FeatureItem name="Historical Fraud Rate" weight={+2.574} />
            <FeatureItem name="Click Frequency" weight={+1.808} />
            <FeatureItem name="Time Since Install" weight={-1.342} />
            <FeatureItem name="Device ID Frequency" weight={+1.256} />
            <FeatureItem name="IP Reputation Score" weight={+2.123} />
            <FeatureItem name="User Agent Validity" weight={+0.987} />
          </div>
          <div className="space-y-2">
            <FeatureItem name="Session Duration" weight={-1.873} />
            <FeatureItem name="Click-to-Install Time" weight={-0.945} />
            <FeatureItem name="Geographic Consistency" weight={+1.456} />
            <FeatureItem name="Engagement Pattern" weight={-1.234} />
            <FeatureItem name="Network Type" weight={+0.678} />
            <FeatureItem name="Referrer Validity" weight={+1.089} />
          </div>
          <div className="space-y-2">
            <FeatureItem name="OS Version" weight={+0.567} />
            <FeatureItem name="App Version" weight={-0.423} />
            <FeatureItem name="Time of Day" weight={+0.789} />
            <FeatureItem name="VPN Detection" weight={+1.945} />
            <FeatureItem name="Proxy Detection" weight={+1.678} />
          </div>
        </div>
      </div>
    </div>
  );
}

interface StatCardProps {
  title: string;
  value: string;
  subtitle: string;
  color: 'red' | 'yellow' | 'blue' | 'green';
  icon: React.ComponentType<{ className?: string }>;
}

function StatCard({ title, value, subtitle, color, icon: Icon }: StatCardProps) {
  const colorMap = {
    red: 'bg-red-500',
    yellow: 'bg-sunshine-yellow',
    blue: 'bg-primary-blue',
    green: 'bg-green-500',
  };

  return (
    <div className="card p-6">
      <div className="flex items-start justify-between mb-4">
        <div>
          <p className="text-sm text-gray-600 font-medium uppercase">{title}</p>
          <h3 className="text-2xl font-bold text-primary-blue mt-1">{value}</h3>
          <p className="text-xs text-gray-500 mt-1">{subtitle}</p>
        </div>
        <div className={`${colorMap[color]} text-white p-3 rounded`}>
          <Icon className="w-6 h-6" />
        </div>
      </div>
    </div>
  );
}

interface FraudTypeBarProps {
  type: string;
  count: number;
  percentage: number;
  color: 'red' | 'yellow' | 'blue' | 'gray';
}

function FraudTypeBar({ type, count, percentage, color }: FraudTypeBarProps) {
  const colorMap = {
    red: 'bg-red-500',
    yellow: 'bg-sunshine-yellow',
    blue: 'bg-primary-blue',
    gray: 'bg-gray-400',
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="font-bold text-primary-blue">{type}</span>
        <span className="text-sm text-gray-600">{count} blocked</span>
      </div>
      <div className="w-full bg-gray-200 h-6 rounded overflow-hidden">
        <div
          className={`${colorMap[color]} h-full flex items-center justify-end pr-2`}
          style={{ width: `${percentage}%` }}
        >
          <span className="text-white text-sm font-bold">{percentage}%</span>
        </div>
      </div>
    </div>
  );
}

interface CountryBlockProps {
  country: string;
  flag: string;
  blocked: number;
  percentage: number;
}

function CountryBlock({ country, flag, blocked, percentage }: CountryBlockProps) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
      <div className="flex items-center gap-3">
        <span className="text-2xl">{flag}</span>
        <span className="font-bold text-primary-blue">{country}</span>
      </div>
      <div className="text-right">
        <p className="font-bold text-red-600">{blocked}</p>
        <p className="text-xs text-gray-500">{percentage}%</p>
      </div>
    </div>
  );
}

interface FraudEventCardProps {
  event: FraudEvent;
}

function FraudEventCard({ event }: FraudEventCardProps) {
  const severityConfig = {
    high: { color: 'border-red-500 bg-red-50', badge: 'bg-red-500' },
    medium: { color: 'border-yellow-500 bg-yellow-50', badge: 'bg-yellow-500' },
    low: { color: 'border-gray-400 bg-gray-50', badge: 'bg-gray-400' },
  };

  const typeLabels = {
    click_fraud: 'Click Fraud',
    install_fraud: 'Install Fraud',
    bot_traffic: 'Bot Traffic',
    vpn_abuse: 'VPN Abuse',
  };

  const config = severityConfig[event.severity];

  return (
    <div className={`border-l-4 ${config.color} p-4 rounded`}>
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-3">
          <div className={`${config.badge} text-white px-3 py-1 rounded text-xs font-bold uppercase`}>
            {typeLabels[event.type]}
          </div>
          <span className="text-sm text-gray-600">{event.timestamp}</span>
        </div>
        {event.blocked ? (
          <div className="flex items-center gap-1 text-green-600 text-sm font-bold">
            <CheckCircleIcon className="w-4 h-4" />
            Blocked
          </div>
        ) : (
          <div className="flex items-center gap-1 text-yellow-600 text-sm font-bold">
            <ExclamationTriangleIcon className="w-4 h-4" />
            Review
          </div>
        )}
      </div>
      <p className="text-gray-700 text-sm mb-2">{event.details}</p>
      <div className="flex items-center gap-4 text-xs text-gray-600">
        <span>IP: {event.ip}</span>
        <span>Country: {event.country}</span>
      </div>
    </div>
  );
}

interface FeatureItemProps {
  name: string;
  weight: number;
}

function FeatureItem({ name, weight }: FeatureItemProps) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm">{name}</span>
      <span className={`text-sm font-bold ${weight > 0 ? 'text-sunshine-yellow' : 'text-white'}`}>
        {weight > 0 ? '+' : ''}{weight.toFixed(3)}
      </span>
    </div>
  );
}
