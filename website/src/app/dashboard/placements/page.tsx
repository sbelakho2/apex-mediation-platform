'use client';

// Reference: Design.md § "Dashboard Pages" & WEBSITE_DESIGN.md § "Placements Page"
// Ad placements management with performance heatmap and format configuration

import {
    CheckCircleIcon,
    PlusCircleIcon,
    XCircleIcon,
} from '@heroicons/react/24/outline';
import { useState } from 'react';

interface Placement {
  id: string;
  name: string;
  format: 'banner' | 'interstitial' | 'rewarded' | 'native';
  app: string;
  status: 'active' | 'inactive';
  impressions: number;
  revenue: number;
  ecpm: number;
  fillRate: number;
  ctr: number;
}

export default function PlacementsPage() {
  const [selectedFormat, setSelectedFormat] = useState<'all' | 'banner' | 'interstitial' | 'rewarded' | 'native'>('all');

  const [placements, setPlacements] = useState<Placement[]>([
    {
      id: '1',
      name: 'Home Screen Banner',
      format: 'banner',
      app: 'Puzzle Quest Pro',
      status: 'active',
      impressions: 123456,
      revenue: 1234.56,
      ecpm: 10.00,
      fillRate: 98.5,
      ctr: 1.2,
    },
    {
      id: '2',
      name: 'Level Complete Interstitial',
      format: 'interstitial',
      app: 'Puzzle Quest Pro',
      status: 'active',
      impressions: 45678,
      revenue: 678.90,
      ecpm: 14.87,
      fillRate: 96.3,
      ctr: 3.4,
    },
    {
      id: '3',
      name: 'Extra Lives Rewarded Video',
      format: 'rewarded',
      app: 'Puzzle Quest Pro',
      status: 'active',
      impressions: 34567,
      revenue: 789.01,
      ecpm: 22.83,
      fillRate: 94.2,
      ctr: 15.6,
    },
    {
      id: '4',
      name: 'Race Results Interstitial',
      format: 'interstitial',
      app: 'Racing Thunder',
      status: 'active',
      impressions: 56789,
      revenue: 812.34,
      ecpm: 14.31,
      fillRate: 97.1,
      ctr: 2.8,
    },
    {
      id: '5',
      name: 'Boost Rewarded Video',
      format: 'rewarded',
      app: 'Racing Thunder',
      status: 'active',
      impressions: 23456,
      revenue: 534.21,
      ecpm: 22.77,
      fillRate: 93.8,
      ctr: 18.2,
    },
    {
      id: '6',
      name: 'Bottom Banner',
      format: 'banner',
      app: 'Word Master',
      status: 'active',
      impressions: 89012,
      revenue: 890.12,
      ecpm: 10.00,
      fillRate: 99.2,
      ctr: 0.9,
    },
    {
      id: '7',
      name: 'Hints Rewarded Video',
      format: 'rewarded',
      app: 'Word Master',
      status: 'active',
      impressions: 12345,
      revenue: 267.89,
      ecpm: 21.70,
      fillRate: 92.5,
      ctr: 16.4,
    },
    {
      id: '8',
      name: 'Article Native Ad',
      format: 'native',
      app: 'Casual Slots',
      status: 'inactive',
      impressions: 0,
      revenue: 0,
      ecpm: 0,
      fillRate: 0,
      ctr: 0,
    },
  ]);

  const [modalState, setModalState] = useState<
    | { type: null }
    | { type: 'create' }
    | { type: 'configure' | 'view-details'; placement: Placement }
  >({ type: null });

  const openModal = (type: 'create' | 'configure' | 'view-details', placement?: Placement) => {
    if (type === 'create') {
      setModalState({ type });
    } else if (placement) {
      setModalState({ type, placement });
    }
  };

  const closeModal = () => setModalState({ type: null });

  const handleActivatePlacement = (id: string) => {
    setPlacements((prev) =>
      prev.map((placement) =>
        placement.id === id
          ? {
              ...placement,
              status: 'active',
              impressions: 12500,
              revenue: 245.67,
              ecpm: 19.65,
              fillRate: 92.3,
              ctr: 2.3,
            }
          : placement
      )
    );
  };

  const filteredPlacements = selectedFormat === 'all'
    ? placements
    : placements.filter(p => p.format === selectedFormat);

  const totalRevenue = placements.reduce((sum, p) => sum + p.revenue, 0);
  const totalImpressions = placements.reduce((sum, p) => sum + p.impressions, 0);
  const avgEcpm = totalRevenue / (totalImpressions / 1000);
  const activePlacements = placements.filter(p => p.status === 'active').length;

  return (
    <div className="p-6 space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-h2-sm font-bold uppercase text-primary-blue tracking-tight">
            Ad Placements
          </h1>
          <p className="text-sm text-gray-600 mt-1">
            Manage ad placements and optimize performance across all apps
          </p>
        </div>
        <button
          className="btn-primary-yellow px-6 py-3 flex items-center gap-2"
          onClick={() => openModal('create')}
        >
          <PlusCircleIcon className="w-5 h-5" />
          Create Placement
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="card-blue p-6">
          <p className="text-sunshine-yellow font-bold uppercase text-sm mb-2">
            Active Placements
          </p>
          <p className="text-white text-4xl font-bold">{activePlacements}</p>
          <p className="text-white text-sm mt-1">of {placements.length} total</p>
        </div>
        <div className="card-blue p-6">
          <p className="text-sunshine-yellow font-bold uppercase text-sm mb-2">
            Total Revenue
          </p>
          <p className="text-white text-4xl font-bold">${totalRevenue.toLocaleString()}</p>
          <p className="text-white text-sm mt-1">this week</p>
        </div>
        <div className="card-blue p-6">
          <p className="text-sunshine-yellow font-bold uppercase text-sm mb-2">
            Avg eCPM
          </p>
          <p className="text-white text-4xl font-bold">${avgEcpm.toFixed(2)}</p>
          <p className="text-white text-sm mt-1">across all placements</p>
        </div>
        <div className="card-blue p-6">
          <p className="text-sunshine-yellow font-bold uppercase text-sm mb-2">
            Impressions
          </p>
          <p className="text-white text-4xl font-bold">{totalImpressions.toLocaleString()}</p>
          <p className="text-white text-sm mt-1">this week</p>
        </div>
      </div>

      {/* Format Filter */}
      <div className="card p-6">
        <h2 className="text-primary-blue font-bold uppercase text-sm mb-4">
          Filter by Format
        </h2>
        <div className="flex flex-wrap gap-3">
          {['all', 'banner', 'interstitial', 'rewarded', 'native'].map((format) => (
            <button
              key={format}
              onClick={() => setSelectedFormat(format as any)}
              className={`px-6 py-3 text-sm font-bold uppercase rounded transition-colors ${
                selectedFormat === format
                  ? 'bg-sunshine-yellow text-primary-blue'
                  : 'bg-white text-gray-600 border-2 border-gray-300 hover:border-primary-blue'
              }`}
            >
              {format === 'all' ? '📊 All Formats' :
               format === 'banner' ? '📱 Banner' :
               format === 'interstitial' ? '🖼️ Interstitial' :
               format === 'rewarded' ? '🎁 Rewarded' :
               '📰 Native'}
            </button>
          ))}
        </div>
      </div>

      {/* Performance Heatmap */}
      <div className="card p-6">
        <h2 className="text-primary-blue font-bold uppercase text-lg mb-4 border-b-2 border-sunshine-yellow pb-2">
          Format Performance Comparison
        </h2>
        <div className="grid md:grid-cols-4 gap-6">
          <FormatHeatmapCard
            format="Banner"
            icon="📱"
            avgEcpm={10.00}
            avgFillRate={98.9}
            avgCtr={1.05}
            count={2}
          />
          <FormatHeatmapCard
            format="Interstitial"
            icon="🖼️"
            avgEcpm={14.59}
            avgFillRate={96.7}
            avgCtr={3.1}
            count={2}
          />
          <FormatHeatmapCard
            format="Rewarded"
            icon="🎁"
            avgEcpm={22.43}
            avgFillRate={93.5}
            avgCtr={16.7}
            count={3}
          />
          <FormatHeatmapCard
            format="Native"
            icon="📰"
            avgEcpm={0}
            avgFillRate={0}
            avgCtr={0}
            count={1}
            inactive
          />
        </div>
      </div>

      {/* Placements List */}
      <div className="space-y-4">
        <h2 className="text-primary-blue font-bold uppercase text-lg">
          {selectedFormat === 'all' ? 'All Placements' : `${selectedFormat} Placements`}
          <span className="text-gray-500 text-sm ml-2">({filteredPlacements.length})</span>
        </h2>
        {filteredPlacements.map((placement) => (
          <PlacementCard
            key={placement.id}
            placement={placement}
            onConfigure={() => openModal('configure', placement)}
            onViewDetails={() => openModal('view-details', placement)}
            onActivate={() => handleActivatePlacement(placement.id)}
          />
        ))}
      </div>

      {/* Best Practices */}
      <div className="card-blue p-6">
        <h2 className="text-sunshine-yellow font-bold uppercase text-lg mb-4">
          Placement Best Practices
        </h2>
        <div className="grid md:grid-cols-2 gap-6 text-white text-sm">
          <div className="space-y-3">
            <div className="flex items-start gap-2">
              <span className="text-sunshine-yellow">✓</span>
              <div>
                <p className="font-bold mb-1">Banner Ads</p>
                <p className="text-white/80">Place at top or bottom of screen. Avoid covering content. Refresh every 30-60 seconds.</p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-sunshine-yellow">✓</span>
              <div>
                <p className="font-bold mb-1">Interstitial Ads</p>
                <p className="text-white/80">Show at natural break points (level complete, menu transitions). Limit frequency to once per 2-3 minutes.</p>
              </div>
            </div>
          </div>
          <div className="space-y-3">
            <div className="flex items-start gap-2">
              <span className="text-sunshine-yellow">✓</span>
              <div>
                <p className="font-bold mb-1">Rewarded Video</p>
                <p className="text-white/80">Offer clear value (extra lives, hints, coins). Always optional. Show reward before video starts.</p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-sunshine-yellow">✓</span>
              <div>
                <p className="font-bold mb-1">Native Ads</p>
                <p className="text-white/80">Match your app's design. Clearly label as "Sponsored". Use in content feeds or articles.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
      <PlacementModal state={modalState} onClose={closeModal} />
    </div>
  );
}

interface FormatHeatmapCardProps {
  format: string;
  icon: string;
  avgEcpm: number;
  avgFillRate: number;
  avgCtr: number;
  count: number;
  inactive?: boolean;
}

function FormatHeatmapCard({ format, icon, avgEcpm, avgFillRate, avgCtr, count, inactive }: FormatHeatmapCardProps) {
  return (
    <div className={`border-2 rounded p-4 ${inactive ? 'border-gray-300 bg-gray-50' : 'border-primary-blue'}`}>
      <div className="flex items-center gap-2 mb-3">
        <span className="text-2xl">{icon}</span>
        <h3 className="font-bold text-primary-blue">{format}</h3>
      </div>
      {inactive ? (
        <p className="text-sm text-gray-600">No active placements</p>
      ) : (
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-600">Avg eCPM:</span>
            <span className="font-bold text-primary-blue">${avgEcpm.toFixed(2)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">Fill Rate:</span>
            <span className="font-bold text-primary-blue">{avgFillRate.toFixed(1)}%</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">Avg CTR:</span>
            <span className="font-bold text-primary-blue">{avgCtr.toFixed(2)}%</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">Count:</span>
            <span className="font-bold text-primary-blue">{count}</span>
          </div>
        </div>
      )}
    </div>
  );
}

interface PlacementCardProps {
  placement: Placement;
  onConfigure: () => void;
  onViewDetails: () => void;
  onActivate: () => void;
}

function PlacementCard({ placement, onConfigure, onViewDetails, onActivate }: PlacementCardProps) {
  const formatIcons = {
    banner: '📱',
    interstitial: '🖼️',
    rewarded: '🎁',
    native: '📰',
  };

  const formatColors = {
    banner: 'bg-blue-100 text-blue-700',
    interstitial: 'bg-purple-100 text-purple-700',
    rewarded: 'bg-green-100 text-green-700',
    native: 'bg-orange-100 text-orange-700',
  };

  return (
    <div className={`card p-6 ${placement.status === 'active' ? 'border-2 border-sunshine-yellow' : ''}`}>
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-start gap-3 flex-1">
          <span className="text-2xl">{formatIcons[placement.format]}</span>
          <div className="flex-1">
            <h3 className="text-lg font-bold text-primary-blue mb-1">{placement.name}</h3>
            <div className="flex items-center gap-3 text-sm text-gray-600">
              <span className={`px-3 py-1 rounded font-bold text-xs ${formatColors[placement.format]}`}>
                {placement.format.toUpperCase()}
              </span>
              <span>{placement.app}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {placement.status === 'active' ? (
            <>
              <CheckCircleIcon className="w-5 h-5 text-green-500" />
              <span className="text-sm font-bold text-green-500">Active</span>
            </>
          ) : (
            <>
              <XCircleIcon className="w-5 h-5 text-gray-500" />
              <span className="text-sm font-bold text-gray-500">Inactive</span>
            </>
          )}
        </div>
      </div>

      {placement.status === 'active' ? (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div>
            <p className="text-xs text-gray-600 uppercase">Impressions</p>
            <p className="text-lg font-bold text-primary-blue">{placement.impressions.toLocaleString()}</p>
          </div>
          <div>
            <p className="text-xs text-gray-600 uppercase">Revenue</p>
            <p className="text-lg font-bold text-primary-blue">${placement.revenue.toFixed(2)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-600 uppercase">eCPM</p>
            <p className="text-lg font-bold text-primary-blue">${placement.ecpm.toFixed(2)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-600 uppercase">Fill Rate</p>
            <p className="text-lg font-bold text-primary-blue">{placement.fillRate}%</p>
          </div>
          <div>
            <p className="text-xs text-gray-600 uppercase">CTR</p>
            <p className="text-lg font-bold text-primary-blue">{placement.ctr}%</p>
          </div>
        </div>
      ) : (
        <div className="bg-gray-50 border border-gray-300 rounded p-3 space-y-3">
          <p className="text-sm text-gray-700">
            This placement is inactive. Click "Activate" to start serving ads.
          </p>
          <button
            onClick={onActivate}
            className="px-4 py-2 text-sm font-bold text-white bg-success-green rounded hover:bg-success-green/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-blue"
          >
            Activate placement
          </button>
        </div>
      )}

      <div className="flex items-center justify-end gap-3 mt-4 pt-4 border-t border-gray-200">
        <button
          onClick={onConfigure}
          className="px-4 py-2 text-sm font-bold text-primary-blue border border-primary-blue rounded hover:bg-primary-blue hover:text-white transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-blue"
        >
          Configure
        </button>
        <button
          onClick={onViewDetails}
          className="px-4 py-2 text-sm font-bold text-white bg-primary-blue rounded hover:bg-primary-blue/90 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sunshine-yellow"
        >
          View Details
        </button>
      </div>
    </div>
  );
}

type PlacementModalState =
  | { type: null }
  | { type: 'create' }
  | { type: 'configure' | 'view-details'; placement: Placement };

function PlacementModal({ state, onClose }: { state: PlacementModalState; onClose: () => void }) {
  if (state.type === null) return null;

  const title = state.type === 'create'
    ? 'Create New Placement'
    : state.type === 'configure'
    ? `Configure ${state.placement.name}`
    : `Placement Insights for ${state.placement.name}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm px-4">
      <div className="w-full max-w-xl rounded-lg border-2 border-primary-blue bg-white shadow-xl">
        <div className="flex items-start justify-between border-b-2 border-sunshine-yellow p-6">
          <h2 className="text-primary-blue font-bold uppercase text-lg">{title}</h2>
          <button
            onClick={onClose}
            className="text-primary-blue text-2xl leading-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-blue"
            aria-label="Close dialog"
          >
            ×
          </button>
        </div>
        <div className="p-6 space-y-4">
          {state.type === 'create' ? (
            <ol className="list-decimal list-inside space-y-2 text-sm text-gray-700">
              <li>Select the app you want to create a placement for.</li>
              <li>Choose the ad format and frequency caps.</li>
              <li>Generate the placement ID and add it to your app.</li>
              <li>Test the placement using ApexMediation sandbox mode.</li>
            </ol>
          ) : (
            <div className="space-y-3 text-sm text-gray-700">
              <p>Format: <strong className="text-primary-blue">{state.placement.format.toUpperCase()}</strong></p>
              <p>Latest eCPM: <strong className="text-primary-blue">${state.placement.ecpm.toFixed(2)}</strong></p>
              <p>Average Fill Rate: <strong className="text-primary-blue">{state.placement.fillRate}%</strong></p>
            </div>
          )}
        </div>
        <div className="flex justify-end gap-3 border-t border-gray-200 p-6">
          <button onClick={onClose} className="btn-outline px-6 py-3 text-sm">
            Close
          </button>
          {state.type === 'create' ? (
            <a href="/documentation#sdk-reference" className="btn-primary-yellow px-6 py-3 text-sm">
              Open placement guide
            </a>
          ) : (
            <a href={`/dashboard/placements/${state.placement.id}`} className="btn-primary-yellow px-6 py-3 text-sm">
              View full report
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
