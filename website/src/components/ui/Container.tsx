import React from 'react';

type ContainerProps = React.HTMLAttributes<HTMLDivElement> & {
  as?: keyof JSX.IntrinsicElements;
};

/**
 * Design-system container that centers content and enforces consistent paddings.
 * Uses Tailwind's configured `container` with responsive gutters.
 */
export default function Container({ as: Tag = 'div', className = '', children, ...rest }: ContainerProps) {
  return (
    <Tag className={`container px-4 md:px-6 lg:px-8 ${className}`} {...rest}>
      {children}
    </Tag>
  );
}
