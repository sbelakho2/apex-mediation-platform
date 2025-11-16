'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { CheckCircle, XCircle, MinusCircle, AlertCircle, RefreshCcw } from 'lucide-react'
import { transparencyApi, type VerifyResult } from '@/lib/transparency'
import { Tooltip } from './Tooltip'
import { Spinner } from './Spinner'

interface VerifyBadgeProps {
  auctionId: string
  hasSigned?: boolean
  compact?: boolean
  autoLoad?: boolean
}

/**
 * Lazy-loading verify badge component that fetches verification status on demand.
 * 
 * States:
 * - PASS: Signature verified successfully (green)
 * - FAIL: Signature verification failed (red)
 * - NOT_APPLICABLE: Auction not signed or not sampled (gray)
 * - UNKNOWN_KEY: Key not found in registry (orange)
 * - Loading: Fetching verification status (spinner)
 * 
 * Features:
 * - Tooltips explaining each status
 * - Click to load (if autoLoad=false)
 * - Compact mode for table cells
 * 
 * @example
 * <VerifyBadge auctionId="auc-123" hasSigned={true} autoLoad={true} />
 */
export function VerifyBadge({ auctionId, hasSigned = true, compact = false, autoLoad = false }: VerifyBadgeProps) {
  const [verifyResult, setVerifyResult] = useState<VerifyResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)
  const abortControllerRef = useRef<AbortController | null>(null)
  const isMountedRef = useRef(true)
  const previousAuctionRef = useRef(auctionId)

  useEffect(() => {
    return () => {
      isMountedRef.current = false
      abortControllerRef.current?.abort()
    }
  }, [])

  const loadVerification = useCallback(async ({ force = false }: { force?: boolean } = {}) => {
    if (loading || (loaded && !force)) return

    abortControllerRef.current?.abort()
    const controller = new AbortController()
    abortControllerRef.current = controller

    setLoading(true)
    setError(null)
    setVerifyResult(null)
    setLoaded(false)

    const handleError = (e: unknown) => {
      if (isAbortError(e)) return
      console.error(`[VerifyBadge] Failed to verify auction ${auctionId}`, e)
      setError(formatVerifyError(e))
    }

    try {
      const result = await transparencyApi.verify(auctionId, { signal: controller.signal })
      if (controller.signal.aborted || !isMountedRef.current) return
      setVerifyResult(result)
      setLoaded(true)
    } catch (e: unknown) {
      if (!controller.signal.aborted) {
        handleError(e)
      }
    } finally {
      if (!controller.signal.aborted && isMountedRef.current) {
        setLoading(false)
        if (abortControllerRef.current === controller) {
          abortControllerRef.current = null
        }
      }
    }
  }, [auctionId, loaded, loading])

  useEffect(() => {
    if (autoLoad && hasSigned && !loaded) {
      void loadVerification()
    }
  }, [autoLoad, hasSigned, loaded, loadVerification])

  useEffect(() => {
    if (previousAuctionRef.current === auctionId) {
      return
    }

    previousAuctionRef.current = auctionId
    setVerifyResult(null)
    setLoaded(false)
    setError(null)
    setLoading(false)
    abortControllerRef.current?.abort()
  }, [auctionId])

  const showRefreshAction = hasSigned && loaded && !loading

  const renderWithRefresh = (badge: React.ReactNode, tooltip?: React.ReactNode) => {
    const badgeContent = tooltip ? <Tooltip content={tooltip}>{badge}</Tooltip> : badge

    if (!showRefreshAction) return badgeContent

    return (
      <span className="inline-flex items-center gap-1.5">
        {badgeContent}
        <Tooltip content="Refresh verification status">
          <button
            type="button"
            onClick={() => void loadVerification({ force: true })}
            className={`inline-flex items-center justify-center rounded border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 transition-colors ${compact ? 'h-6 w-6' : 'px-2 py-1 text-xs font-medium'}`}
            aria-label={`Refresh verification for auction ${auctionId}`}
            disabled={loading}
          >
            <RefreshCcw className={compact ? 'h-3.5 w-3.5' : 'h-4 w-4'} aria-hidden="true" />
            {!compact && <span className="ml-1">Refresh</span>}
          </button>
        </Tooltip>
      </span>
    )
  }

  // Not signed
  if (!hasSigned) {
    const tooltip = "This auction was not sampled for transparency or signature is missing"
    const badge = (
      <span className={`inline-flex items-center gap-1.5 ${compact ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-sm'} rounded bg-gray-100 text-gray-600 font-medium`}>
        <MinusCircle className={compact ? 'h-3 w-3' : 'h-4 w-4'} aria-hidden="true" />
        {!compact && 'Not Signed'}
      </span>
    )
    return <Tooltip content={tooltip}>{badge}</Tooltip>
  }

  // Loading
  if (loading) {
    const badge = (
      <span className={`inline-flex items-center gap-1.5 ${compact ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-sm'} rounded bg-gray-100 text-gray-600 font-medium`}>
        <Spinner size="sm" label="Verifying..." />
        {!compact && 'Verifying...'}
      </span>
    )
    return badge
  }

  // Error
  if (error) {
    const tooltip = `${error} Click to retry.`
    const badge = (
      <button
        type="button"
        onClick={() => void loadVerification()}
        className={`inline-flex items-center gap-1.5 ${compact ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-sm'} rounded bg-red-100 text-red-600 font-medium hover:bg-red-200 transition-colors`}
        aria-label={compact ? `Retry verification for auction ${auctionId}` : undefined}
      >
        <AlertCircle className={compact ? 'h-3 w-3' : 'h-4 w-4'} aria-hidden="true" />
        {!compact && 'Retry verification'}
      </button>
    )
    return <Tooltip content={tooltip}>{badge}</Tooltip>
  }

  // Not loaded yet - show click to load
  if (!loaded && !autoLoad) {
    return (
      <button
        onClick={() => void loadVerification()}
        className={`inline-flex items-center gap-1.5 ${compact ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-sm'} rounded bg-primary-50 text-primary-600 font-medium hover:bg-primary-100 transition-colors`}
        aria-label={compact ? `Verify auction ${auctionId}` : undefined}
      >
        <CheckCircle className={compact ? 'h-3 w-3' : 'h-4 w-4'} aria-hidden="true" />
        {!compact && 'Verify'}
      </button>
    )
  }

  // Loaded - show result
  if (verifyResult) {
    const statusConfig = {
      pass: {
        icon: CheckCircle,
        color: 'bg-green-100 text-green-700',
        label: 'PASS',
        tooltip: 'Signature verified successfully. This auction record is authentic and has not been tampered with.',
      },
      fail: {
        icon: XCircle,
        color: 'bg-red-100 text-red-700',
        label: 'FAIL',
        tooltip: `Signature verification failed. ${verifyResult.reason || 'The signature does not match the canonical payload.'}`,
      },
      not_applicable: {
        icon: MinusCircle,
        color: 'bg-gray-100 text-gray-600',
        label: 'N/A',
        tooltip: 'Verification not applicable. This auction was not sampled for transparency or uses an unsupported algorithm.',
      },
      unknown_key: {
        icon: AlertCircle,
        color: 'bg-orange-100 text-orange-700',
        label: 'UNKNOWN KEY',
        tooltip: `The signing key (${verifyResult.key_id || 'unknown'}) is not found in the active key registry. This may indicate a rotated or test key.`,
      },
    }

    const config = statusConfig[verifyResult.status] || statusConfig.not_applicable
    const Icon = config.icon

    const badge = (
      <span className={`inline-flex items-center gap-1.5 ${compact ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-sm'} rounded ${config.color} font-medium`}>
        <Icon className={compact ? 'h-3 w-3' : 'h-4 w-4'} aria-hidden="true" />
        {compact ? config.label.split(' ')[0] : config.label}
      </span>
    )

    return renderWithRefresh(badge, config.tooltip)
  }

  return null
}

function isAbortError(error: unknown) {
  if (!error) return false
  if (error instanceof DOMException && error.name === 'AbortError') return true
  if (typeof error === 'object' && 'code' in (error as Record<string, unknown>)) {
    return (error as { code?: string }).code === 'ERR_CANCELED'
  }
  return false
}

function formatVerifyError(error: unknown) {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return 'Offline. Check your connection and retry.'
  }
  if (error instanceof Error && /timeout/i.test(error.message)) {
    return 'Verification timed out. Please try again.'
  }
  return 'Verification temporarily unavailable. Try again.'
}
