'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'

function isActive(pathname: string | null, href: string) {
  if (!pathname) return false
  if (href === '/') return pathname === '/'
  return pathname === href || pathname.startsWith(href + '/')
}

function NavLink({ href, children }: { href: string; children: ReactNode }) {
  const pathname = usePathname()
  const active = isActive(pathname, href)
  const base = 'px-3 py-2 rounded-md text-sm font-medium transition-colors'
  const activeCls = 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
  const idleCls = 'text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800'
  return (
    <Link href={href} className={[base, active ? activeCls : idleCls].join(' ')}>
      {children}
    </Link>
  )
}

export function AppShellV2({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-white text-zinc-900 dark:bg-zinc-950 dark:text-zinc-50">
      <header className="sticky top-0 z-40 w-full border-b border-zinc-200 bg-white/80 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/80">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-2">
            <Link href="/" className="inline-flex items-center gap-2" aria-label="ApexMediation Home">
              {/*
                Branding: uses /logo.jpg from Next.js public directory.
                Place a copy of the repo root logo.jpg into console/public/logo.jpg for this to render.
                Text fallback remains visible for a11y and when image fails to load.
              */}
              <Image
                src="/api/brand/logo"
                alt="ApexMediation"
                width={28}
                height={28}
                className="h-7 w-7 rounded-sm shadow-sm"
                priority
              />
              <span className="text-sm font-semibold tracking-tight text-zinc-700 dark:text-zinc-200">ApexMediation</span>
            </Link>
            <span className="rounded bg-emerald-600/10 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">Console v2</span>
          </div>
          <nav className="hidden items-center gap-1 md:flex">
            <NavLink href="/dashboard">Dashboard</NavLink>
            <NavLink href="/billing/usage">Billing</NavLink>
            <NavLink href="/transparency/auctions">Transparency</NavLink>
            <NavLink href="/settings">Settings</NavLink>
            <NavLink href="/admin/health">Admin</NavLink>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        {children}
      </main>
    </div>
  )
}

export default AppShellV2
