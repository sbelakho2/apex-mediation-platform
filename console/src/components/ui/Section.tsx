import React from 'react'

type SectionProps = React.HTMLAttributes<HTMLElement> & {
  as?: keyof JSX.IntrinsicElements
  inset?: boolean
}

/**
 * Vertical rhythm wrapper for console pages. Mirrors website Section for consistent spacing.
 */
export default function Section({
  as: Tag = 'section',
  inset = false,
  className = '',
  children,
  ...rest
}: SectionProps) {
  const pad = inset ? 'py-6 md:py-8' : 'py-10 md:py-12 lg:py-16'
  return (
    <Tag className={`${pad} ${className}`} {...rest}>
      {children}
    </Tag>
  )
}
