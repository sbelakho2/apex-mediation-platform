import type { ReactNode } from 'react';

interface SocialIconLinkProps {
  href: string;
  label: string;
  children: ReactNode;
}

/**
 * Icon link with consistent sizing and focus states for footer and elsewhere.
 */
export default function SocialIconLink({ href, label, children }: SocialIconLinkProps) {
  return (
    <a
      href={href}
      aria-label={label}
      className="flex h-10 w-10 items-center justify-center rounded-full border border-white/20 text-white transition-all duration-200 hover:border-white hover:text-sunshine-yellow focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white [&>svg]:h-5 [&>svg]:w-5 [&>svg]:shrink-0 [&>svg]:fill-current"
    >
      <span className="block" aria-hidden="true">
        {children}
      </span>
    </a>
  );
}
