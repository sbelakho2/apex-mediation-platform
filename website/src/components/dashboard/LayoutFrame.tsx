'use client';

import { ReactNode, useState } from 'react';

import DashboardSidebar from './Sidebar';
import DashboardTopBar from './TopBar';

interface DashboardLayoutFrameProps {
  children: ReactNode;
}

export default function DashboardLayoutFrame({ children }: DashboardLayoutFrameProps) {
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen bg-cream text-primary-blue">
      <DashboardSidebar
        mobileOpen={mobileSidebarOpen}
        onClose={() => setMobileSidebarOpen(false)}
      />
      <div className="lg:pl-64">
        <DashboardTopBar onToggleSidebar={() => setMobileSidebarOpen(true)} />
        <main className="py-6">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="rounded-3xl bg-white/95 p-6 shadow-xl ring-1 ring-primary-blue/10 sm:p-8">
              {children}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
