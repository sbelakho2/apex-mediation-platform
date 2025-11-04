import RevenueOverview from '@/components/dashboard/RevenueOverview';
import { getSession } from '@/lib/auth';

export default async function DashboardPage() {
  const user = await getSession();

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">
          Welcome back, {user?.name || user?.email}!
        </h1>
        <p className="mt-2 text-gray-600">
          Here's what's happening with your ad monetization today.
        </p>
      </div>

      <RevenueOverview />

      {/* Quick Stats */}
      <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Today's Revenue"
          value="$0.00"
          change="+0%"
          trend="up"
        />
        <StatCard
          title="Total Impressions"
          value="0"
          change="+0%"
          trend="up"
        />
        <StatCard
          title="eCPM"
          value="$0.00"
          change="+0%"
          trend="neutral"
        />
        <StatCard
          title="Fill Rate"
          value="0%"
          change="+0%"
          trend="up"
        />
      </div>

      {/* Getting Started */}
      <div className="mt-8 bg-blue-50 border border-blue-200 rounded-lg p-6">
        <h2 className="text-lg font-semibold text-blue-900 mb-4">
          🚀 Get Started
        </h2>
        <div className="space-y-3">
          <ChecklistItem completed={false}>
            Add your first app
          </ChecklistItem>
          <ChecklistItem completed={false}>
            Create an ad placement
          </ChecklistItem>
          <ChecklistItem completed={false}>
            Integrate the SDK
          </ChecklistItem>
          <ChecklistItem completed={false}>
            Configure ad networks
          </ChecklistItem>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  title,
  value,
  change,
  trend,
}: {
  title: string;
  value: string;
  change: string;
  trend: 'up' | 'down' | 'neutral';
}) {
  const trendColor = {
    up: 'text-green-600',
    down: 'text-red-600',
    neutral: 'text-gray-600',
  }[trend];

  return (
    <div className="bg-white overflow-hidden shadow rounded-lg">
      <div className="p-5">
        <div className="flex items-center">
          <div className="flex-1">
            <dt className="text-sm font-medium text-gray-500 truncate">{title}</dt>
            <dd className="mt-1 text-3xl font-semibold text-gray-900">{value}</dd>
          </div>
        </div>
        <div className="mt-4">
          <span className={`text-sm font-medium ${trendColor}`}>{change}</span>
          <span className="text-sm text-gray-500 ml-2">vs yesterday</span>
        </div>
      </div>
    </div>
  );
}

function ChecklistItem({
  completed,
  children,
}: {
  completed: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center">
      <input
        type="checkbox"
        checked={completed}
        readOnly
        className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
      />
      <span className={`ml-3 text-sm ${completed ? 'line-through text-gray-500' : 'text-gray-700'}`}>
        {children}
      </span>
    </div>
  );
}
