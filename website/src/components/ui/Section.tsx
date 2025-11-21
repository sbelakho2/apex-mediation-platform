import React, { type ElementType, type ComponentPropsWithoutRef, type ReactNode } from 'react';

type SectionProps<T extends ElementType> = {
  as?: T;
  inset?: boolean; // if true, reduce vertical padding
  className?: string;
  children?: ReactNode;
} & Omit<ComponentPropsWithoutRef<T>, 'as' | 'className' | 'children'>;

/**
 * Vertical rhythm wrapper for page sections. Keeps spacing consistent across pages.
 */
export default function Section<T extends ElementType = 'section'>(
  { as, inset = false, className = '', children, ...rest }: SectionProps<T>
) {
  const Tag = (as || 'section') as ElementType;
  const pad = inset ? 'py-6 md:py-8' : 'py-10 md:py-12 lg:py-16';
  return (
    <Tag className={`${pad} ${className || ''}`} {...(rest as any)}>
      {children}
    </Tag>
  );
}
