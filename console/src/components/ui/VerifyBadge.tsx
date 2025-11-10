'use client'

import { useState, useEffect } from 'react'
import { CheckCircle, XCircle, MinusCircle, AlertCircle } from 'lucide-react'
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

  useEffect(() => {
    if (autoLoad && hasSigned && !loaded) {
      loadVerification()
    }
  }, [autoLoad, hasSigned, loaded])

  const loadVerification = async () => {
    if (loading || loaded) return
    
    setLoading(true)
    setError(null)
    try {
      const result = await transparencyApi.verify(auctionId)
      setVerifyResult(result)
      setLoaded(true)
    } catch (e: any) {
      setError(e?.message || 'Failed to verify')
    } finally {
      setLoading(false)
    }
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
    const tooltip = `Verification error: ${error}`
    const badge = (
      <span className={`inline-flex items-center gap-1.5 ${compact ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-sm'} rounded bg-red-100 text-red-600 font-medium`}>
        <AlertCircle className={compact ? 'h-3 w-3' : 'h-4 w-4'} aria-hidden="true" />
        {!compact && 'Error'}
      </span>
    )
    return <Tooltip content={tooltip}>{badge}</Tooltip>
  }

  // Not loaded yet - show click to load
  if (!loaded && !autoLoad) {
    return (
      <button
        onClick={loadVerification}
        className={`inline-flex items-center gap-1.5 ${compact ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-sm'} rounded bg-primary-50 text-primary-600 font-medium hover:bg-primary-100 transition-colors`}
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

    return <Tooltip content={config.tooltip}>{badge}</Tooltip>
  }

  return null
}
