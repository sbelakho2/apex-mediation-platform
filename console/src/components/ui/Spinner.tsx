'use client'

import { Loader2 } from 'lucide-react'

interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg'
  className?: string
  label?: string
}

/**
 * Loading spinner component using Lucide icon with animation.
 * 
 * Follows Console design standards:
 * - Uses primary-600 color from palette
 * - Accessible (includes sr-only label)
 * - Three size variants
 * 
 * @example
 * <Spinner size="sm" label="Verifying signature..." />
 */
export function Spinner({ size = 'md', className = '', label = 'Loading...' }: SpinnerProps) {
  const sizeClasses = {
    sm: 'h-4 w-4',
    md: 'h-6 w-6',
    lg: 'h-8 w-8',
  }

  return (
    <div className={`inline-flex items-center gap-2 ${className}`}>
      <Loader2 
        className={`${sizeClasses[size]} text-primary-600 animate-spin`}
        aria-hidden="true"
      />
      <span className="sr-only">{label}</span>
    </div>
  )
}

interface SkeletonProps {
  className?: string
  variant?: 'text' | 'circular' | 'rectangular'
  width?: string
  height?: string
}

/**
 * Skeleton loader component for content placeholders.
 * 
 * Follows Console design standards:
 * - Uses gray-200 bg with pulse animation
 * - Supports multiple variants
 * - Respects custom dimensions
 * 
 * @example
 * <Skeleton variant="text" width="w-32" height="h-4" />
 * <Skeleton variant="circular" width="w-10" height="h-10" />
 */
export function Skeleton({ className = '', variant = 'rectangular', width, height }: SkeletonProps) {
  const baseClasses = 'animate-pulse bg-gray-200'
  
  const variantClasses = {
    text: 'rounded',
    circular: 'rounded-full',
    rectangular: 'rounded-lg',
  }

  return (
    <div 
      className={`${baseClasses} ${variantClasses[variant]} ${width || ''} ${height || ''} ${className}`}
      aria-hidden="true"
    />
  )
}
