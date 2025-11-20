"use client"

import { forwardRef } from 'react'
import clsx from 'clsx'

type ButtonVariant = 'primary' | 'secondary' | 'ghost'
type ButtonSize = 'sm' | 'md' | 'lg'

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  isLoading?: boolean
}

function variantClasses(variant: ButtonVariant): string {
  switch (variant) {
    case 'secondary':
      return 'bg-zinc-100 text-zinc-900 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-700'
    case 'ghost':
      return 'bg-transparent text-zinc-900 hover:bg-zinc-100 dark:text-zinc-100 dark:hover:bg-zinc-800'
    case 'primary':
    default:
      return 'bg-[var(--color-brand)] text-[var(--color-brand-foreground)] hover:brightness-110'
  }
}

function sizeClasses(size: ButtonSize): string {
  switch (size) {
    case 'sm':
      return 'h-8 px-3 text-[var(--text-sm)]'
    case 'lg':
      return 'h-11 px-5 text-[var(--text-lg)]'
    case 'md':
    default:
      return 'h-10 px-4 text-[var(--text-sm)]'
  }
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = 'primary', size = 'md', isLoading = false, disabled, children, ...props },
  ref
) {
  const isDisabled = disabled || isLoading
  return (
    <button
      ref={ref}
      className={clsx(
        'inline-flex items-center justify-center rounded-[var(--radius-md)] font-medium transition-colors focus-visible:outline-none',
        'focus-visible:[box-shadow:var(--focus-ring)] disabled:opacity-60 disabled:pointer-events-none',
        variantClasses(variant),
        sizeClasses(size),
        className
      )}
      aria-busy={isLoading || undefined}
      disabled={isDisabled}
      {...props}
    >
      {isLoading ? (
        <span className="inline-flex items-center gap-2">
          <Spinner className="h-4 w-4" />
          <span className="sr-only">Loading</span>
          <span aria-hidden>{children}</span>
        </span>
      ) : (
        children
      )}
    </button>
  )
})

function Spinner({ className }: { className?: string }) {
  return (
    <svg
      className={clsx('animate-spin text-current', className)}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      role="img"
      aria-label="Loading"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
      />
    </svg>
  )
}

export default Button
