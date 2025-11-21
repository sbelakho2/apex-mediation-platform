import React, { type ElementType, type ComponentPropsWithoutRef, type ReactNode } from 'react';

type ContainerProps<T extends ElementType> = {
  as?: T;
  className?: string;
  children?: ReactNode;
} & Omit<ComponentPropsWithoutRef<T>, 'as' | 'className' | 'children'>;

/**
 * Design-system container that centers content and enforces consistent paddings.
 * Uses Tailwind's configured `container` with responsive gutters.
 */
export default function Container<T extends ElementType = 'div'>(
  { as, className = '', children, ...rest }: ContainerProps<T>
) {
  const Tag = (as || 'div') as ElementType;
  return (
    <Tag className={`container px-4 md:px-6 lg:px-8 ${className || ''}`} {...(rest as any)}>
      {children}
    </Tag>
  );
}
