'use client'

import { useEffect, useRef, useState } from 'react'
import { Copy, Check } from 'lucide-react'
import { Tooltip } from './Tooltip'
import { t } from '@/i18n'

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
  const [copyState, setCopyState] = useState<'idle' | 'success' | 'error'>('idle')
  const timerRef = useRef<ReturnType<typeof window.setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
      }
    }
  }, [])

  const copyToClipboard = async (value: string) => {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(value)
      return
    }

    const textarea = document.createElement('textarea')
    textarea.value = value
    textarea.setAttribute('readonly', '')
    textarea.style.position = 'fixed'
    textarea.style.top = '-9999px'
    document.body.appendChild(textarea)
    textarea.select()
    const succeeded = document.execCommand('copy')
    document.body.removeChild(textarea)
    if (!succeeded) {
      throw new Error('Clipboard API unavailable')
    }
  }

  const scheduleReset = (delay: number) => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
    }
    timerRef.current = window.setTimeout(() => setCopyState('idle'), delay)
  }

  const handleCopy = async () => {
    try {
      await copyToClipboard(text)
      setCopyState('success')
      scheduleReset(2000)
    } catch (err) {
      console.error('Failed to copy:', err)
      setCopyState('error')
      scheduleReset(4000)
    }
  }

  const copyLabel = label || t('ui.copyButton.copy')
  const successLabel = t('ui.copyButton.copied')
  const errorLabel = t('ui.copyButton.error')
  const defaultTooltip = label || t('ui.copyButton.tooltip')
  const tooltipText = copyState === 'success' ? successLabel : copyState === 'error' ? errorLabel : defaultTooltip
  const statusAnnouncer =
    copyState === 'idle' ? null : (
      <span className="sr-only" role="status" aria-live="polite">
        {copyState === 'success' ? successLabel : errorLabel}
      </span>
    )

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
        type="button"
        className={`inline-flex items-center justify-center ${size === 'sm' ? 'p-1' : 'p-1.5'} rounded hover:bg-gray-100 transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 text-gray-600 hover:text-gray-900 ${copyState === 'error' ? 'text-danger-600' : ''}`}
        aria-label={label || 'Copy to clipboard'}
      >
        {copyState === 'success' ? (
          <Check className={`${sizeClasses[size]} text-green-600`} aria-hidden="true" />
        ) : (
          <Copy className={sizeClasses[size]} aria-hidden="true" />
        )}
      </button>
    )

    return (
      <>
        <Tooltip content={tooltipText}>{button}</Tooltip>
        {statusAnnouncer}
      </>
    )
  }

  // Inline variant
  if (variant === 'inline') {
    const button = (
      <button
        onClick={handleCopy}
        type="button"
        className={`inline-flex items-center gap-1.5 text-xs transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 ${
          copyState === 'error' ? 'text-danger-600' : 'text-gray-600 hover:text-gray-900'
        }`}
        aria-label={label || 'Copy to clipboard'}
      >
        {copyState === 'success' ? (
          <>
            <Check className="h-3 w-3 text-green-600" aria-hidden="true" />
            <span className="text-green-600 font-medium">{successLabel}</span>
          </>
        ) : copyState === 'error' ? (
          <>
            <Copy className="h-3 w-3" aria-hidden="true" />
            <span className="font-medium">{errorLabel}</span>
          </>
        ) : (
          <>
            <Copy className="h-3 w-3" aria-hidden="true" />
            <span>{copyLabel}</span>
          </>
        )}
      </button>
    )

    return (
      <>
        {button}
        {statusAnnouncer}
      </>
    )
  }

  // Default button variant
  const button = (
    <button
      onClick={handleCopy}
      type="button"
      className={`inline-flex items-center gap-2 ${buttonSizeClasses[size]} border rounded hover:bg-gray-50 transition-colors font-medium focus:outline-none focus:ring-2 focus:ring-primary-500 ${
        copyState === 'success'
          ? 'text-green-600 border-green-300 bg-green-50'
          : copyState === 'error'
            ? 'text-danger-600 border-danger-200'
            : 'text-gray-700 border-gray-300'
      }`}
      aria-label={label || 'Copy to clipboard'}
    >
      {copyState === 'success' ? (
        <>
          <Check className={sizeClasses[size]} aria-hidden="true" />
          {successLabel}
        </>
      ) : copyState === 'error' ? (
        <>
          <Copy className={sizeClasses[size]} aria-hidden="true" />
          {errorLabel}
        </>
      ) : (
        <>
          <Copy className={sizeClasses[size]} aria-hidden="true" />
          {copyLabel}
        </>
      )}
    </button>
  )

  return (
    <>
      {button}
      {statusAnnouncer}
    </>
  )
}
