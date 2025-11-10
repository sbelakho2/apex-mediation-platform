'use client'

import { useState } from 'react'
import { Copy, Check } from 'lucide-react'
import { Tooltip } from './Tooltip'

interface CopyButtonProps {
  text: string
  label?: string
  variant?: 'default' | 'inline' | 'icon'
  size?: 'sm' | 'md'
}

/**
 * Enhanced copy button with visual feedback and accessibility.
 * 
 * Features:
 * - Checkmark icon on successful copy
 * - Tooltip with copy status
 * - Multiple variants (default button, inline, icon-only)
 * - Keyboard accessible
 * 
 * @example
 * <CopyButton text="auc-123" label="Copy Auction ID" />
 * <CopyButton text={signature} variant="icon" size="sm" />
 */
export function CopyButton({ text, label, variant = 'default', size = 'md' }: CopyButtonProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  const sizeClasses = {
    sm: 'h-3.5 w-3.5',
    md: 'h-4 w-4',
  }

  const buttonSizeClasses = {
    sm: 'px-2 py-1 text-xs',
    md: 'px-3 py-1.5 text-sm',
  }

  // Icon-only variant
  if (variant === 'icon') {
    const button = (
      <button
        onClick={handleCopy}
        className={`inline-flex items-center justify-center ${size === 'sm' ? 'p-1' : 'p-1.5'} rounded hover:bg-gray-100 transition-colors text-gray-600 hover:text-gray-900`}
        aria-label={label || 'Copy to clipboard'}
      >
        {copied ? (
          <Check className={`${sizeClasses[size]} text-green-600`} aria-hidden="true" />
        ) : (
          <Copy className={sizeClasses[size]} aria-hidden="true" />
        )}
      </button>
    )

    return (
      <Tooltip content={copied ? 'Copied!' : (label || 'Copy to clipboard')}>
        {button}
      </Tooltip>
    )
  }

  // Inline variant
  if (variant === 'inline') {
    const button = (
      <button
        onClick={handleCopy}
        className="inline-flex items-center gap-1.5 text-xs text-gray-600 hover:text-gray-900 transition-colors"
        aria-label={label || 'Copy to clipboard'}
      >
        {copied ? (
          <>
            <Check className="h-3 w-3 text-green-600" aria-hidden="true" />
            <span className="text-green-600 font-medium">Copied</span>
          </>
        ) : (
          <>
            <Copy className="h-3 w-3" aria-hidden="true" />
            <span>{label || 'Copy'}</span>
          </>
        )}
      </button>
    )

    return button
  }

  // Default button variant
  const button = (
    <button
      onClick={handleCopy}
      className={`inline-flex items-center gap-2 ${buttonSizeClasses[size]} border rounded hover:bg-gray-50 transition-colors font-medium ${copied ? 'text-green-600 border-green-300 bg-green-50' : 'text-gray-700 border-gray-300'}`}
      aria-label={label || 'Copy to clipboard'}
    >
      {copied ? (
        <>
          <Check className={sizeClasses[size]} aria-hidden="true" />
          Copied
        </>
      ) : (
        <>
          <Copy className={sizeClasses[size]} aria-hidden="true" />
          {label || 'Copy'}
        </>
      )}
    </button>
  )

  return button
}
