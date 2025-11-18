import DashboardLayoutFrame from '@/components/dashboard/LayoutFrame';
import { requireAuth } from '@/lib/auth';
import { redirect } from 'next/navigation';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // TESTING MODE: Authentication check disabled
  // try {
  //   await requireAuth();
  // } catch (error) {
  //   redirect('/signin');
  // }

  return <DashboardLayoutFrame>{children}</DashboardLayoutFrame>;
}
