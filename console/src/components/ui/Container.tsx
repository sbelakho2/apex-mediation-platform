import React from 'react'

type ContainerProps = React.HTMLAttributes<HTMLElement> & {
  as?: 'div' | 'section' | 'main' | 'article' | 'header' | 'footer' | 'aside' | 'nav'
}

/**
 * Centers content and applies responsive horizontal padding.
 * Mirrors website Container for a unified look.
 */
export default function Container({ as: Tag = 'div', className = '', children, ...rest }: ContainerProps) {
  return (
    <Tag className={`container px-4 md:px-6 lg:px-8 ${className}`} {...rest}>
      {children}
    </Tag>
  )
}
