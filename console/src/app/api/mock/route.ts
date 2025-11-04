// Mock API for local testing
// This provides realistic data for all dashboard features
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'

// Helper to generate random data
const random = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min
const randomFloat = (min: number, max: number, decimals = 2) =>
  parseFloat((Math.random() * (max - min) + min).toFixed(decimals))

// Generate time series data
function generateTimeSeries(days: number) {
  const data = []
  const now = new Date()
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(now)
    date.setDate(date.getDate() - i)
    data.push({
      date: date.toISOString().split('T')[0],
      revenue: randomFloat(1000, 5000),
      impressions: random(50000, 200000),
      clicks: random(500, 2000),
      ecpm: randomFloat(2, 8),
      fillRate: randomFloat(75, 95),
    })
  }
  return data
}

// Mock data generators
const mockData = {
  revenueSummary: {
    totalRevenue: randomFloat(45000, 85000),
    revenueChangePercent: randomFloat(-15, 25),
    totalImpressions: random(2000000, 5000000),
    impressionsChangePercent: randomFloat(-10, 30),
    averageEcpm: randomFloat(3.5, 7.5),
    ecpmChangePercent: randomFloat(-8, 12),
    averageFillRate: randomFloat(82, 94),
    fillRateChangePercent: randomFloat(-5, 10),
    totalClicks: random(25000, 75000),
    ctr: randomFloat(1.2, 3.5),
  },

  revenueTimeSeries: generateTimeSeries(30),

  placements: [
    {
      id: 'plc_1',
      name: 'Main Menu Banner',
      type: 'banner',
      status: 'active',
      adUnitId: 'ca-app-pub-123/456',
      revenue: randomFloat(5000, 15000),
      impressions: random(500000, 1000000),
      ecpm: randomFloat(4, 8),
      fillRate: randomFloat(85, 95),
      createdAt: '2024-01-15T10:00:00Z',
      updatedAt: '2024-11-01T15:30:00Z',
    },
    {
      id: 'plc_2',
      name: 'Gameplay Interstitial',
      type: 'interstitial',
      status: 'active',
      adUnitId: 'ca-app-pub-123/789',
      revenue: randomFloat(8000, 20000),
      impressions: random(300000, 700000),
      ecpm: randomFloat(8, 15),
      fillRate: randomFloat(75, 90),
      createdAt: '2024-01-15T10:00:00Z',
      updatedAt: '2024-11-01T15:30:00Z',
    },
    {
      id: 'plc_3',
      name: 'Reward Video - Extra Lives',
      type: 'rewarded',
      status: 'active',
      adUnitId: 'ca-app-pub-123/101',
      revenue: randomFloat(12000, 25000),
      impressions: random(200000, 500000),
      ecpm: randomFloat(15, 30),
      fillRate: randomFloat(80, 95),
      createdAt: '2024-02-01T10:00:00Z',
      updatedAt: '2024-11-01T15:30:00Z',
    },
  ],

  adapters: [
    {
      id: 'adp_1',
      name: 'Google AdMob',
      network: 'admob',
      status: 'active',
      priority: 1,
      revenue: randomFloat(15000, 35000),
      impressions: random(800000, 1500000),
      ecpm: randomFloat(5, 10),
      fillRate: randomFloat(88, 96),
      bidFloor: 2.5,
      timeout: 3000,
    },
    {
      id: 'adp_2',
      name: 'AppLovin MAX',
      network: 'applovin',
      status: 'active',
      priority: 2,
      revenue: randomFloat(12000, 28000),
      impressions: random(600000, 1200000),
      ecpm: randomFloat(4.5, 9),
      fillRate: randomFloat(85, 93),
      bidFloor: 2.0,
      timeout: 3000,
    },
    {
      id: 'adp_3',
      name: 'Meta Audience Network',
      network: 'facebook',
      status: 'active',
      priority: 3,
      revenue: randomFloat(8000, 18000),
      impressions: random(400000, 900000),
      ecpm: randomFloat(4, 8),
      fillRate: randomFloat(78, 88),
      bidFloor: 1.8,
      timeout: 3000,
    },
    {
      id: 'adp_4',
      name: 'IronSource',
      network: 'ironsource',
      status: 'active',
      priority: 4,
      revenue: randomFloat(6000, 15000),
      impressions: random(300000, 700000),
      ecpm: randomFloat(3.5, 7),
      fillRate: randomFloat(75, 85),
      bidFloor: 1.5,
      timeout: 3000,
    },
  ],

  fraudStats: {
    totalTraffic: random(2000000, 5000000),
    fraudulentTraffic: random(10000, 50000),
    fraudRate: randomFloat(0.5, 2.5),
    blockedRevenue: randomFloat(500, 2500),
    detectionMethods: {
      givt: random(3000, 15000),
      sivt: random(2000, 10000),
      ml: random(3000, 15000),
      anomaly: random(2000, 10000),
    },
    topIssues: [
      { type: 'Bot Traffic', count: random(5000, 15000), severity: 'high' },
      { type: 'Click Injection', count: random(2000, 8000), severity: 'critical' },
      { type: 'SDK Spoofing', count: random(1000, 5000), severity: 'medium' },
      { type: 'Device Farm', count: random(500, 2000), severity: 'high' },
    ],
  },

  fraudAlerts: [
    {
      id: 'alert_1',
      type: 'bot_traffic',
      severity: 'high',
      message: 'Unusual bot traffic detected from IP range 192.168.1.0/24',
      timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
      affectedImpressions: random(1000, 5000),
      status: 'investigating',
    },
    {
      id: 'alert_2',
      type: 'click_injection',
      severity: 'critical',
      message: 'Click injection pattern detected on placement plc_2',
      timestamp: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
      affectedImpressions: random(500, 2000),
      status: 'blocked',
    },
    {
      id: 'alert_3',
      type: 'anomaly',
      severity: 'medium',
      message: 'Abnormal eCPM spike detected (+250% in last hour)',
      timestamp: new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString(),
      affectedImpressions: random(200, 1000),
      status: 'resolved',
    },
  ],

  payoutHistory: [
    {
      id: 'payout_1',
      amount: randomFloat(8500, 12500),
      status: 'completed',
      method: 'stripe',
      scheduledDate: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      paidDate: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      period: 'Oct 1-15, 2024',
    },
    {
      id: 'payout_2',
      amount: randomFloat(9000, 14000),
      status: 'completed',
      method: 'paypal',
      scheduledDate: new Date(Date.now() - 22 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      paidDate: new Date(Date.now() - 22 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      period: 'Sep 16-30, 2024',
    },
    {
      id: 'payout_3',
      amount: randomFloat(7500, 11000),
      status: 'processing',
      method: 'stripe',
      scheduledDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      period: 'Oct 16-31, 2024',
    },
  ],

  upcomingPayout: {
    id: 'payout_upcoming',
    amount: randomFloat(5000, 9000),
    status: 'pending',
    method: 'stripe',
    scheduledDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    period: 'Nov 1-15, 2024',
    daysUntilPayout: 5,
  },

  analytics: {
    impressionsByPlacement: [
      { placement: 'Main Menu Banner', impressions: random(800000, 1200000), revenue: randomFloat(8000, 15000) },
      { placement: 'Gameplay Interstitial', impressions: random(600000, 1000000), revenue: randomFloat(12000, 20000) },
      { placement: 'Reward Video', impressions: random(400000, 800000), revenue: randomFloat(15000, 30000) },
    ],
    impressionsByAdapter: [
      { adapter: 'Google AdMob', impressions: random(1000000, 1800000), revenue: randomFloat(15000, 30000) },
      { adapter: 'AppLovin MAX', impressions: random(800000, 1500000), revenue: randomFloat(12000, 25000) },
      { adapter: 'Meta Audience', impressions: random(600000, 1200000), revenue: randomFloat(8000, 18000) },
      { adapter: 'IronSource', impressions: random(400000, 900000), revenue: randomFloat(6000, 15000) },
    ],
  },
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const endpoint = searchParams.get('endpoint')

  // Simulate network delay
  await new Promise(resolve => setTimeout(resolve, random(100, 500)))

  try {
    switch (endpoint) {
      case 'revenue-summary':
        return NextResponse.json(mockData.revenueSummary)
      
      case 'revenue-timeseries':
        return NextResponse.json(mockData.revenueTimeSeries)
      
      case 'placements':
        return NextResponse.json({
          items: mockData.placements,
          total: mockData.placements.length,
          page: 1,
          pageSize: 10,
        })
      
      case 'adapters':
        return NextResponse.json(mockData.adapters)
      
      case 'fraud-stats':
        return NextResponse.json(mockData.fraudStats)
      
      case 'fraud-alerts':
        return NextResponse.json({ alerts: mockData.fraudAlerts })
      
      case 'payout-history':
        return NextResponse.json({
          items: mockData.payoutHistory,
          total: mockData.payoutHistory.length,
          page: 1,
          pageSize: 10,
        })
      
      case 'payout-upcoming':
        return NextResponse.json(mockData.upcomingPayout)
      
      case 'analytics':
        return NextResponse.json(mockData.analytics)
      
      default:
        return NextResponse.json({ error: 'Unknown endpoint' }, { status: 404 })
    }
  } catch (error) {
    console.error('Mock API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
