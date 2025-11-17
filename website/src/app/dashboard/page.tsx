import RevenueOverview from '@/components/dashboard/RevenueOverview';
import { getSession } from '@/lib/auth';
import DashboardStats from '@/components/dashboard/DashboardStats';

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
      <DashboardStats />

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
