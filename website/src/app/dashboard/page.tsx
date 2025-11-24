import RevenueOverview from '@/components/dashboard/RevenueOverview';
import { getSession } from '@/lib/auth';
import DashboardStats from '@/components/dashboard/DashboardStats';
import Section from '@/components/ui/Section';
import Container from '@/components/ui/Container';

export default async function DashboardPage() {
  const user = await getSession();

  return (
    <Section>
      <Container className="space-y-6">
        <div className="mb-2">
          <h1 className="text-h2-sm md:text-h2-md lg:text-h2 font-semibold text-gray-900">
            Welcome back, {user?.name || user?.email}!
          </h1>
          <p className="mt-1 text-sm text-gray-600">
            Here&rsquo;s what&rsquo;s happening with your ad monetization today.
          </p>
        </div>

        <RevenueOverview />

        {/* Quick Stats */}
        <DashboardStats />

        {/* Getting Started */}
        <div className="card-v2">
          <div className="card-v2-header">
            <h2 className="text-sm font-semibold text-gray-900">🚀 Get Started</h2>
          </div>
          <div className="card-v2-body space-y-3">
            <ChecklistItem completed={false}>Add your first app</ChecklistItem>
            <ChecklistItem completed={false}>Create an ad placement</ChecklistItem>
            <ChecklistItem completed={false}>Integrate the SDK</ChecklistItem>
            <ChecklistItem completed={false}>Configure ad networks</ChecklistItem>
          </div>
        </div>
      </Container>
    </Section>
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
        className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
      />
      <span className={`ml-3 text-sm ${completed ? 'line-through text-gray-500' : 'text-gray-700'}`}>
        {children}
      </span>
    </div>
  );
}
