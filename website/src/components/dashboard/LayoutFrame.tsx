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
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <DashboardSidebar
        mobileOpen={mobileSidebarOpen}
        onClose={() => setMobileSidebarOpen(false)}
      />
      {/* Left rail: 280px on lg+ per WEBSITE_FIX */}
      <div className="lg:pl-[280px]">
        <DashboardTopBar onToggleSidebar={() => setMobileSidebarOpen(true)} />
        <main className="py-6 md:py-8">
          <div className="container">
            <div className="card-v2">
              <div className="card-v2-body">
                {children}
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
