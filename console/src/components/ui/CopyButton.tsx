'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
const translate = (key: string, fallback: string) => {
  const value = t(key)
  return value === key ? fallback : value
}

export function CopyButton({ text, label, variant = 'default', size = 'md' }: CopyButtonProps) {
  const [copyState, setCopyState] = useState<'idle' | 'success' | 'error'>('idle')
  const [errorDetails, setErrorDetails] = useState<string | null>(null)
  const [clipboardSupport, setClipboardSupport] = useState<'unknown' | 'supported' | 'unsupported'>('unknown')
  const [unsupportedReason, setUnsupportedReason] = useState<'insecure' | 'unavailable' | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const isSecureContext = typeof window.isSecureContext === 'boolean'
      ? window.isSecureContext
      : window.location?.protocol === 'https:'

    if (!isSecureContext) {
      setClipboardSupport('unsupported')
      setUnsupportedReason('insecure')
      return
    }

    const hasAsyncClipboard = Boolean(navigator?.clipboard?.writeText)
    let canExecCommand = false
    try {
      canExecCommand = typeof document !== 'undefined' && typeof document.queryCommandSupported === 'function'
        ? document.queryCommandSupported('copy')
        : false
    } catch {
      canExecCommand = false
    }

    if (hasAsyncClipboard || canExecCommand) {
      setClipboardSupport('supported')
      setUnsupportedReason(null)
    } else {
      setClipboardSupport('unsupported')
      setUnsupportedReason('unavailable')
    }
  }, [])

  const copyToClipboard = async (value: string) => {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(value)
      return
    }

    if (typeof document === 'undefined') {
      throw new Error('Clipboard API unavailable')
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

  const scheduleReset = useCallback((delay: number) => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
    }
    timerRef.current = setTimeout(() => setCopyState('idle'), delay)
  }, [])

  const handleCopy = async () => {
    if (clipboardSupport === 'unsupported') {
      setCopyState('error')
      const fallbackMessage =
        unsupportedReason === 'insecure'
          ? translate('ui.copyButton.insecure', 'Clipboard actions require a secure (HTTPS or localhost) connection')
          : translate('ui.copyButton.unsupported', 'Clipboard access unavailable in this browser')
      setErrorDetails(fallbackMessage)
      scheduleReset(4000)
      return
    }
    try {
      await copyToClipboard(text)
      setCopyState('success')
      setErrorDetails(null)
      scheduleReset(2000)
    } catch (err) {
      setCopyState('error')
      setErrorDetails(err instanceof Error ? err.message : translate('ui.copyButton.unsupported', 'Clipboard access unavailable in this browser'))
      scheduleReset(4000)
    }
  }

  const copyLabel = useMemo(() => label || translate('ui.copyButton.copy', 'Copy'), [label])
  const successLabel = useMemo(() => translate('ui.copyButton.copied', 'Copied'), [])
  const errorLabel = useMemo(() => translate('ui.copyButton.error', 'Unable to copy'), [])
  const unsupportedLabel = useMemo(() => translate('ui.copyButton.unsupported', 'Clipboard access unavailable in this browser'), [])
  const defaultTooltip = useMemo(() => label || translate('ui.copyButton.tooltip', 'Copy to clipboard'), [label])
  const fallbackInstructions = useMemo(
    () => translate('ui.copyButton.fallbackInstructions', 'Select the text manually and press Ctrl/Cmd + C.'),
    [],
  )
  const insecureContextLabel = useMemo(
    () => translate('ui.copyButton.insecure', 'Clipboard actions require a secure (HTTPS or localhost) connection'),
    [],
  )
  const fallbackMessage = useMemo(() => {
    if (clipboardSupport !== 'unsupported') return null
    if (unsupportedReason === 'insecure') {
      return `${insecureContextLabel}. ${fallbackInstructions}`
    }
    return `${unsupportedLabel} ${fallbackInstructions}`
  }, [clipboardSupport, fallbackInstructions, insecureContextLabel, unsupportedLabel, unsupportedReason])
  const tooltipText =
    clipboardSupport === 'unsupported'
      ? fallbackMessage || unsupportedLabel
      : copyState === 'success'
        ? successLabel
        : copyState === 'error'
          ? errorDetails
            ? `${errorLabel}: ${errorDetails}`
            : errorLabel
          : defaultTooltip
  const statusAnnouncer =
    copyState === 'idle' ? null : (
      <span className="sr-only" role="status" aria-live="polite">
        {copyState === 'success' ? successLabel : errorLabel}
      </span>
    )

  const isCopyDisabled = clipboardSupport === 'unsupported'
  const renderFallbackHelper = (currentVariant: CopyButtonProps['variant']) => {
    if (!fallbackMessage) return null
    const className =
      currentVariant === 'inline'
        ? 'ml-2 inline-flex text-[11px] text-gray-500'
        : 'mt-1 block text-xs text-gray-500'
    return (
      <span className={className} data-testid="copy-fallback-hint" role="note">
        {fallbackMessage}
      </span>
    )
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
        type="button"
        className={`inline-flex items-center justify-center ${size === 'sm' ? 'p-1' : 'p-1.5'} rounded hover:bg-gray-100 transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 text-gray-600 hover:text-gray-900 ${copyState === 'error' ? 'text-danger-600' : ''} ${
          isCopyDisabled ? 'opacity-60 cursor-not-allowed hover:bg-transparent' : ''
        }`}
        aria-label={label || 'Copy to clipboard'}
        disabled={isCopyDisabled}
        aria-disabled={isCopyDisabled}
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
        {renderFallbackHelper('icon')}
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
        } ${isCopyDisabled ? 'opacity-60 cursor-not-allowed' : ''}`}
        disabled={isCopyDisabled}
        aria-disabled={isCopyDisabled}
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
            <span className="font-medium">{errorDetails || errorLabel}</span>
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
        <Tooltip content={tooltipText}>{button}</Tooltip>
        {statusAnnouncer}
        {renderFallbackHelper('inline')}
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
      } ${isCopyDisabled ? 'opacity-60 cursor-not-allowed hover:bg-white' : ''}`}
      aria-label={label || 'Copy to clipboard'}
      disabled={isCopyDisabled}
      aria-disabled={isCopyDisabled}
    >
      {copyState === 'success' ? (
        <>
          <Check className={sizeClasses[size]} aria-hidden="true" />
          {successLabel}
        </>
      ) : copyState === 'error' ? (
        <>
          <Copy className={sizeClasses[size]} aria-hidden="true" />
          {errorDetails || errorLabel}
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
      <Tooltip content={tooltipText}>{button}</Tooltip>
      {statusAnnouncer}
      {renderFallbackHelper('default')}
    </>
  )
}
