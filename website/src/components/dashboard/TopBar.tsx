'use client';

import { Bars3Icon, BellIcon, UserCircleIcon } from '@heroicons/react/24/outline';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

type DashboardTopBarProps = {
  onToggleSidebar?: () => void;
};

export default function DashboardTopBar({ onToggleSidebar }: DashboardTopBarProps) {
  const router = useRouter();
  const [showUserMenu, setShowUserMenu] = useState(false);

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/signin');
  };

  return (
    <div className="sticky top-0 z-20 flex h-16 flex-shrink-0 items-center bg-primary-blue/95 text-white shadow-lg backdrop-blur">
      <button
        type="button"
        className="border-r border-sunshine-yellow/30 px-4 text-sunshine-yellow transition hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sunshine-yellow lg:hidden"
        aria-label="Open sidebar"
  onClick={() => onToggleSidebar?.()}
      >
        <Bars3Icon className="h-6 w-6" aria-hidden="true" />
      </button>
      <div className="flex flex-1 items-center justify-between px-4">
        <div className="flex flex-1 items-center gap-3">
          <span className="hidden text-xs font-semibold uppercase tracking-[0.2em] text-sunshine-yellow/90 sm:inline-flex">
            ApexMediation Control Center
          </span>
        </div>
        <div className="ml-4 flex items-center gap-3 md:ml-6">
          <button
            type="button"
            className="rounded-full bg-sunshine-yellow p-2 text-primary-blue transition hover:bg-pale-yellow focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sunshine-yellow"
            aria-label="View notifications"
            onClick={() => router.push('/dashboard/settings?tab=notifications')}
          >
            <BellIcon className="h-6 w-6" aria-hidden="true" />
          </button>

          {/* Profile dropdown */}
          <div className="relative ml-3">
            <div>
              <button
                type="button"
                className="flex max-w-xs items-center rounded-full border border-sunshine-yellow/50 bg-primary-blue/60 p-1 text-sm transition hover:bg-primary-blue focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sunshine-yellow"
                onClick={() => setShowUserMenu(!showUserMenu)}
                aria-haspopup="menu"
                aria-expanded={showUserMenu}
              >
                <span className="sr-only">Open user menu</span>
                <UserCircleIcon className="h-8 w-8 text-sunshine-yellow" />
              </button>
            </div>

            {showUserMenu && (
              <div
                className="absolute right-0 z-40 mt-2 w-56 origin-top-right rounded-xl bg-white py-2 text-primary-blue shadow-xl ring-1 ring-primary-blue/10 focus:outline-none"
                role="menu"
              >
                <a
                  href="/dashboard/settings"
                  className="block px-4 py-2 text-sm font-semibold transition hover:bg-cream"
                  role="menuitem"
                >
                  Your Profile
                </a>
                <a
                  href="/dashboard/settings"
                  className="block px-4 py-2 text-sm font-semibold transition hover:bg-cream"
                  role="menuitem"
                >
                  Settings
                </a>
                <button
                  onClick={handleLogout}
                  className="block w-full px-4 py-2 text-left text-sm font-semibold text-accent-red transition hover:bg-cream"
                  type="button"
                  role="menuitem"
                >
                  Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
