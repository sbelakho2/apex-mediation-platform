'use client';

export default function RevenueOverview() {
  // In production, this would fetch real data from the API
  const stats = {
    today: { revenue: 0, impressions: 0, clicks: 0, ecpm: 0 },
    yesterday: { revenue: 0, impressions: 0, clicks: 0, ecpm: 0 },
    thisWeek: { revenue: 0, impressions: 0, clicks: 0, ecpm: 0 },
    thisMonth: { revenue: 0, impressions: 0, clicks: 0, ecpm: 0 },
  };

  return (
    <div className="bg-white shadow rounded-lg p-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-4">Revenue Overview</h2>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <TimeCard
          title="Today"
          revenue={stats.today.revenue}
          impressions={stats.today.impressions}
          ecpm={stats.today.ecpm}
        />
        <TimeCard
          title="Yesterday"
          revenue={stats.yesterday.revenue}
          impressions={stats.yesterday.impressions}
          ecpm={stats.yesterday.ecpm}
        />
        <TimeCard
          title="This Week"
          revenue={stats.thisWeek.revenue}
          impressions={stats.thisWeek.impressions}
          ecpm={stats.thisWeek.ecpm}
        />
        <TimeCard
          title="This Month"
          revenue={stats.thisMonth.revenue}
          impressions={stats.thisMonth.impressions}
          ecpm={stats.thisMonth.ecpm}
        />
      </div>

      <div className="mt-6 text-center text-sm text-gray-500">
        <p>📊 Start generating revenue by adding your first app and placement</p>
      </div>
    </div>
  );
}

function TimeCard({
  title,
  revenue,
  impressions,
  ecpm,
}: {
  title: string;
  revenue: number;
  impressions: number;
  ecpm: number;
}) {
  return (
    <div className="border border-gray-200 rounded-lg p-4">
      <h3 className="text-sm font-medium text-gray-500 mb-3">{title}</h3>
      <div className="space-y-2">
        <div>
          <p className="text-2xl font-bold text-gray-900">
            ${revenue.toFixed(2)}
          </p>
          <p className="text-xs text-gray-500">Revenue</p>
        </div>
        <div className="flex justify-between text-sm">
          <div>
            <p className="font-medium text-gray-700">{impressions.toLocaleString()}</p>
            <p className="text-xs text-gray-500">Impressions</p>
          </div>
          <div>
            <p className="font-medium text-gray-700">${ecpm.toFixed(2)}</p>
            <p className="text-xs text-gray-500">eCPM</p>
          </div>
        </div>
      </div>
    </div>
  );
}
