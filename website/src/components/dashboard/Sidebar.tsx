'use client';

import {
    BeakerIcon,
    ChartBarIcon,
    Cog6ToothIcon,
    CurrencyDollarIcon,
    DevicePhoneMobileIcon,
    GlobeAltIcon,
    HomeIcon,
    MapPinIcon,
    ShieldCheckIcon,
} from '@heroicons/react/24/outline';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

type DashboardSidebarProps = {
  mobileOpen?: boolean;
  onClose?: () => void;
};

const navigation = [
  { name: 'Dashboard', href: '/dashboard', icon: HomeIcon },
  { name: 'Revenue', href: '/dashboard/revenue', icon: CurrencyDollarIcon },
  { name: 'Analytics', href: '/dashboard/analytics', icon: ChartBarIcon },
  { name: 'Ad Networks', href: '/dashboard/networks', icon: GlobeAltIcon },
  { name: 'A/B Tests', href: '/dashboard/ab-tests', icon: BeakerIcon },
  { name: 'Fraud Detection', href: '/dashboard/fraud', icon: ShieldCheckIcon },
  { name: 'Apps', href: '/dashboard/apps', icon: DevicePhoneMobileIcon },
  { name: 'Placements', href: '/dashboard/placements', icon: MapPinIcon },
  // Observability
  { name: 'Observability Overview', href: '/dashboard/observability/overview', icon: ChartBarIcon },
  { name: 'Adapter Metrics', href: '/dashboard/observability/metrics', icon: ChartBarIcon },
  { name: 'Mediation Debugger', href: '/dashboard/observability/debugger', icon: BeakerIcon },
  { name: 'Settings', href: '/dashboard/settings', icon: Cog6ToothIcon },
];

export default function DashboardSidebar({ mobileOpen = false, onClose }: DashboardSidebarProps) {
  const pathname = usePathname();

  const handleNavigate = () => {
    if (onClose) {
      onClose();
    }
  };

  return (
    <>
      <div className="hidden lg:fixed lg:inset-y-0 lg:flex lg:w-64 lg:flex-col">
        <div className="flex flex-grow flex-col overflow-y-auto bg-primary-blue pt-5 pb-4">
          <div className="flex flex-shrink-0 items-center px-4">
            <h1 className="text-2xl font-bold uppercase tracking-tight text-sunshine-yellow">ApexMediation</h1>
          </div>
          <nav className="mt-5 flex flex-1 flex-col divide-y divide-sunshine-yellow/20 overflow-y-auto" aria-label="Sidebar">
            <div className="space-y-1 px-2">
              {navigation.map((item) => {
                const isActive = pathname === item.href;
                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    className={`
                      group flex items-center rounded-md px-2 py-2 text-sm font-medium leading-6
                      ${
                        isActive
                          ? 'bg-sunshine-yellow text-primary-blue font-bold'
                          : 'text-white hover:bg-primary-blue/50 hover:text-sunshine-yellow'
                      }
                    `}
                  >
                    <item.icon className="mr-4 h-6 w-6 flex-shrink-0" aria-hidden="true" />
                    {item.name}
                  </Link>
                );
              })}
            </div>
          </nav>
        </div>
      </div>

      {mobileOpen && (
        <div className="lg:hidden" role="dialog" aria-modal="true">
          <div className="fixed inset-0 z-40 bg-black/50" onClick={onClose} />
          <div className="fixed inset-y-0 right-0 z-50 flex w-72 flex-col bg-primary-blue pt-5 pb-6 shadow-2xl">
            <div className="flex items-center justify-between px-4">
              <h2 className="text-lg font-bold uppercase tracking-widest text-sunshine-yellow">
                Navigate
              </h2>
              <button
                type="button"
                onClick={onClose}
                className="rounded-full border border-sunshine-yellow/60 bg-primary-blue/80 px-3 py-1 text-sunshine-yellow transition hover:bg-primary-blue focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sunshine-yellow"
              >
                Close
              </button>
            </div>
            <nav className="mt-6 flex-1 overflow-y-auto" aria-label="Mobile sidebar">
              <div className="space-y-1 px-4">
                {navigation.map((item) => {
                  const isActive = pathname === item.href;
                  return (
                    <Link
                      key={item.name}
                      href={item.href}
                      onClick={handleNavigate}
                      className={`
                        flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold uppercase tracking-wide transition
                        ${
                          isActive
                            ? 'bg-sunshine-yellow text-primary-blue'
                            : 'text-sunshine-yellow hover:bg-primary-blue/60 hover:text-white'
                        }
                      `}
                    >
                      <item.icon className="h-5 w-5" aria-hidden="true" />
                      {item.name}
                    </Link>
                  );
                })}
              </div>
            </nav>
          </div>
        </div>
      )}
    </>
  );
}
