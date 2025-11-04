'use client';

// Reference: Design.md § "Dashboard Pages" & WEBSITE_DESIGN.md § "Networks Page"
// Ad Networks management page for connecting and monitoring ad network integrations

import {
    CheckCircleIcon,
    ExclamationTriangleIcon,
    PlusCircleIcon,
    XCircleIcon,
} from '@heroicons/react/24/outline';
import { useState } from 'react';

interface Network {
  id: string;
  name: string;
  status: 'active' | 'inactive' | 'error';
  revenue: number;
  impressions: number;
  ecpm: number;
  fillRate: number;
  lastSync: string;
}

export default function NetworksPage() {
  const [networks] = useState<Network[]>([
    {
      id: '1',
      name: 'Google AdMob',
      status: 'active',
      revenue: 4234.12,
      impressions: 285678,
      ecpm: 14.82,
      fillRate: 98.3,
      lastSync: '2 minutes ago',
    },
    {
      id: '2',
      name: 'Meta Audience Network',
      status: 'active',
      revenue: 2145.67,
      impressions: 159456,
      ecpm: 13.45,
      fillRate: 96.7,
      lastSync: '5 minutes ago',
    },
    {
      id: '3',
      name: 'Unity Ads',
      status: 'active',
      revenue: 1523.89,
      impressions: 117423,
      ecpm: 12.98,
      fillRate: 94.2,
      lastSync: '8 minutes ago',
    },
    {
      id: '4',
      name: 'AppLovin',
      status: 'active',
      revenue: 1030.50,
      impressions: 91789,
      ecpm: 11.23,
      fillRate: 92.1,
      lastSync: '12 minutes ago',
    },
    {
      id: '5',
      name: 'ironSource',
      status: 'inactive',
      revenue: 0,
      impressions: 0,
      ecpm: 0,
      fillRate: 0,
      lastSync: 'Not connected',
    },
    {
      id: '6',
      name: 'Vungle',
      status: 'error',
      revenue: 0,
      impressions: 0,
      ecpm: 0,
      fillRate: 0,
      lastSync: '2 hours ago',
    },
  ]);

  const activeNetworks = networks.filter((n) => n.status === 'active').length;
  const totalRevenue = networks.reduce((sum, n) => sum + n.revenue, 0);
  const totalImpressions = networks.reduce((sum, n) => sum + n.impressions, 0);

  return (
    <div className="p-6 space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-h2-sm font-bold uppercase text-primary-blue tracking-tight">
            Ad Networks
          </h1>
          <p className="text-sm text-gray-600 mt-1">
            Manage your ad network integrations and monitor performance
          </p>
        </div>
        <button className="btn-primary-yellow px-6 py-3 flex items-center gap-2">
          <PlusCircleIcon className="w-5 h-5" />
          Add Network
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="card-blue p-6">
          <p className="text-sunshine-yellow font-bold uppercase text-sm mb-2">
            Active Networks
          </p>
          <p className="text-white text-4xl font-bold">{activeNetworks}</p>
          <p className="text-white text-sm mt-1">of {networks.length} total</p>
        </div>
        <div className="card-blue p-6">
          <p className="text-sunshine-yellow font-bold uppercase text-sm mb-2">
            Total Revenue (Week)
          </p>
          <p className="text-white text-4xl font-bold">${totalRevenue.toLocaleString()}</p>
          <p className="text-white text-sm mt-1">across all networks</p>
        </div>
        <div className="card-blue p-6">
          <p className="text-sunshine-yellow font-bold uppercase text-sm mb-2">
            Total Impressions
          </p>
          <p className="text-white text-4xl font-bold">{totalImpressions.toLocaleString()}</p>
          <p className="text-white text-sm mt-1">this week</p>
        </div>
      </div>

      {/* Networks Grid */}
      <div className="grid md:grid-cols-2 gap-6">
        {networks.map((network) => (
          <NetworkCard key={network.id} network={network} />
        ))}
      </div>

      {/* Integration Instructions */}
      <div className="card p-6">
        <h2 className="text-primary-blue font-bold uppercase text-lg mb-4 border-b-2 border-sunshine-yellow pb-2">
          How to Add a Network
        </h2>
        <ol className="space-y-3 text-body text-gray-700">
          <li className="flex gap-3">
            <span className="font-bold text-sunshine-yellow">1.</span>
            <span>
              Click the "Add Network" button above and select your ad network from the list
            </span>
          </li>
          <li className="flex gap-3">
            <span className="font-bold text-sunshine-yellow">2.</span>
            <span>
              Enter your API credentials (App ID, API Key, etc.) from the network's dashboard
            </span>
          </li>
          <li className="flex gap-3">
            <span className="font-bold text-sunshine-yellow">3.</span>
            <span>
              Configure bidding parameters: min eCPM, timeout, priority level
            </span>
          </li>
          <li className="flex gap-3">
            <span className="font-bold text-sunshine-yellow">4.</span>
            <span>
              Test the connection and wait for the first ad request (usually within 5 minutes)
            </span>
          </li>
          <li className="flex gap-3">
            <span className="font-bold text-sunshine-yellow">5.</span>
            <span>
              Monitor performance in real-time and adjust settings as needed
            </span>
          </li>
        </ol>
      </div>
    </div>
  );
}

interface NetworkCardProps {
  network: Network;
}

function NetworkCard({ network }: NetworkCardProps) {
  const statusConfig = {
    active: {
      icon: CheckCircleIcon,
      color: 'text-green-500',
      bg: 'bg-green-50',
      label: 'Active',
    },
    inactive: {
      icon: XCircleIcon,
      color: 'text-gray-500',
      bg: 'bg-gray-50',
      label: 'Inactive',
    },
    error: {
      icon: ExclamationTriangleIcon,
      color: 'text-red-500',
      bg: 'bg-red-50',
      label: 'Error',
    },
  };

  const config = statusConfig[network.status];
  const StatusIcon = config.icon;

  return (
    <div className={`card p-6 ${network.status === 'active' ? 'border-2 border-sunshine-yellow' : ''}`}>
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1">
          <h3 className="text-xl font-bold text-primary-blue mb-1">{network.name}</h3>
          <div className={`flex items-center gap-2 ${config.color}`}>
            <StatusIcon className="w-4 h-4" />
            <span className="text-sm font-bold">{config.label}</span>
          </div>
        </div>
        {network.status === 'active' && (
          <div className="bg-sunshine-yellow text-primary-blue px-3 py-1 rounded text-xs font-bold uppercase">
            Live
          </div>
        )}
      </div>

      {/* Metrics */}
      {network.status === 'active' ? (
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <p className="text-xs text-gray-600 uppercase">Revenue (Week)</p>
            <p className="text-lg font-bold text-primary-blue">${network.revenue.toLocaleString()}</p>
          </div>
          <div>
            <p className="text-xs text-gray-600 uppercase">Impressions</p>
            <p className="text-lg font-bold text-primary-blue">{network.impressions.toLocaleString()}</p>
          </div>
          <div>
            <p className="text-xs text-gray-600 uppercase">eCPM</p>
            <p className="text-lg font-bold text-primary-blue">${network.ecpm.toFixed(2)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-600 uppercase">Fill Rate</p>
            <p className="text-lg font-bold text-primary-blue">{network.fillRate}%</p>
          </div>
        </div>
      ) : (
        <div className={`${config.bg} p-4 rounded mb-4`}>
          <p className="text-sm text-gray-700">
            {network.status === 'inactive' && 'This network is not connected. Click "Configure" to set up.'}
            {network.status === 'error' && 'Connection error. Check your credentials and try reconnecting.'}
          </p>
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between pt-4 border-t border-gray-200">
        <span className="text-xs text-gray-500">Last sync: {network.lastSync}</span>
        <div className="flex gap-2">
          <button className="px-4 py-2 text-sm font-bold text-primary-blue border border-primary-blue rounded hover:bg-primary-blue hover:text-white transition-colors">
            Configure
          </button>
          {network.status === 'active' && (
            <button className="px-4 py-2 text-sm font-bold text-white bg-primary-blue rounded hover:bg-primary-blue/90 transition-colors">
              View Stats
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
