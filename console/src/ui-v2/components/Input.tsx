"use client"

import { forwardRef } from 'react'
import clsx from 'clsx'

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean
  size?: 'sm' | 'md' | 'lg'
}

function sizeCls(size: NonNullable<InputProps['size']>) {
  switch (size) {
    case 'sm':
      return 'h-8 px-3 text-[var(--text-sm)]'
    case 'lg':
      return 'h-11 px-4 text-[var(--text-lg)]'
    case 'md':
    default:
      return 'h-10 px-3 text-[var(--text-sm)]'
  }
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, invalid, size = 'md', ...props },
  ref
) {
  return (
    <input
      ref={ref}
      className={clsx(
        'w-full rounded-[var(--radius-md)] bg-[var(--color-surface)] text-[var(--color-fg)]',
        'placeholder:text-[var(--color-muted)] border border-[var(--color-border)]',
        'focus-visible:outline-none focus-visible:[box-shadow:var(--focus-ring)]',
        'disabled:opacity-60 disabled:cursor-not-allowed',
        sizeCls(size),
        invalid && 'border-[var(--color-danger)]',
        className
      )}
      aria-invalid={invalid || undefined}
      {...props}
    />
  )
})

export default Input
