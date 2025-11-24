import DashboardLayoutFrame from '@/components/dashboard/LayoutFrame';

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
