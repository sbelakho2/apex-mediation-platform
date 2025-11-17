"use client";
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import React, { useMemo } from 'react';

export type Crumb = {
  label: string;
  href?: string;
};

export function buildBreadcrumbsFromPath(pathname: string): Crumb[] {
  const segments = pathname.split('/').filter(Boolean);
  const crumbs: Crumb[] = [{ label: 'Home', href: '/' }];
  let acc = '';
  for (let i = 0; i < segments.length; i++) {
    acc += '/' + segments[i];
    const isLast = i === segments.length - 1;
    const label = decodeURIComponent(segments[i])
      .replace(/[-_]+/g, ' ')
      .replace(/\b\w/g, (m) => m.toUpperCase());
    crumbs.push({ label, href: isLast ? undefined : acc });
  }
  return crumbs;
}

export default function Breadcrumbs({ items }: { items?: Crumb[] }) {
  const pathname = usePathname();
  const inferred = useMemo(() => buildBreadcrumbsFromPath(pathname || '/'), [pathname]);
  const list = items && items.length ? items : inferred;

  return (
    <nav aria-label="Breadcrumb" className="mb-6 text-sm text-neutral-600">
      <ol className="flex flex-wrap items-center gap-2">
        {list.map((item, idx) => {
          const isLast = idx === list.length - 1;
          return (
            <li key={`${item.label}-${idx}`} className="flex items-center gap-2">
              {item.href && !isLast ? (
                <Link
                  href={item.href}
                  className="text-neutral-700 underline decoration-1 underline-offset-2 hover:no-underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
                >
                  {item.label}
                </Link>
              ) : (
                <span aria-current={isLast ? 'page' : undefined} className="font-medium text-neutral-900">
                  {item.label}
                </span>
              )}
              {!isLast && <span className="opacity-60">/</span>}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
