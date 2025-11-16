'use client'

import { useState, useRef, useEffect, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { useFloating, offset, flip, shift, arrow, autoUpdate } from '@floating-ui/react-dom'

interface TooltipProps {
  content: string | React.ReactNode
  children: React.ReactNode
  position?: 'top' | 'bottom' | 'left' | 'right'
  delay?: number
}

/**
 * Tooltip component for displaying contextual help text on hover or focus.
 * 
 * Follows Console design standards:
 * - Uses documented color palette (gray-900 bg, white text)
 * - Accessible (keyboard navigation, screen readers)
 * - Responsive positioning
 * 
 * @example
 * <Tooltip content="This auction was verified successfully">
 *   <span className="badge">PASS</span>
 * </Tooltip>
 */
export function Tooltip({ content, children, position = 'top', delay = 200 }: TooltipProps) {
  const [isVisible, setIsVisible] = useState(false)
  const [isClient, setIsClient] = useState(false)
  // Store timers in refs so they are not tied to re-renders and can be cleared reliably
  const showTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const arrowRef = useRef<HTMLDivElement | null>(null)

  const { x, y, strategy, refs, placement, middlewareData } = useFloating({
    placement: position,
    middleware: [offset(8), flip({ padding: 8 }), shift({ padding: 8 }), arrow({ element: arrowRef })],
    whileElementsMounted: autoUpdate,
  })

  const handleMouseEnter = () => {
    if (showTimeoutRef.current) {
      clearTimeout(showTimeoutRef.current)
      showTimeoutRef.current = null
    }
    showTimeoutRef.current = setTimeout(() => setIsVisible(true), delay)
  }

  const handleMouseLeave = () => {
    if (showTimeoutRef.current) {
      clearTimeout(showTimeoutRef.current)
      showTimeoutRef.current = null
    }
    setIsVisible(false)
  }

  const handleFocus = () => {
    setIsVisible(true)
  }

  const handleBlur = () => {
    setIsVisible(false)
  }

  // Clear timers on unmount and when delay changes
  useEffect(() => {
    return () => {
      if (showTimeoutRef.current) {
        clearTimeout(showTimeoutRef.current)
        showTimeoutRef.current = null
      }
    }
  }, [delay])

  useEffect(() => {
    setIsClient(true)
    return () => setIsClient(false)
  }, [])

  const staticSide: Record<string, string> = {
    top: 'bottom',
    right: 'left',
    bottom: 'top',
    left: 'right',
  }

  const currentPlacement = placement.split('-')[0]
  const arrowStyle: CSSProperties = {
    left: middlewareData.arrow?.x != null ? `${middlewareData.arrow.x}px` : undefined,
    top: middlewareData.arrow?.y != null ? `${middlewareData.arrow.y}px` : undefined,
    [staticSide[currentPlacement] || 'top']: '-4px',
  }

  return (
    <span
      className="inline-flex"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onFocus={handleFocus}
      onBlur={handleBlur}
      ref={refs.setReference}
    >
      {children}
      {isClient && isVisible && typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={refs.setFloating}
            role="tooltip"
            className="z-50 px-3 py-2 text-sm text-white bg-gray-900 rounded-lg shadow-lg whitespace-nowrap"
            style={{
              position: strategy,
              top: y ?? 0,
              left: x ?? 0,
            }}
          >
            {content}
            <div
              ref={arrowRef}
              className="absolute w-0 h-0 border-4 border-transparent"
              style={{
                ...arrowStyle,
                borderTopColor: currentPlacement === 'bottom' ? '#111827' : 'transparent',
                borderBottomColor: currentPlacement === 'top' ? '#111827' : 'transparent',
                borderLeftColor: currentPlacement === 'right' ? '#111827' : 'transparent',
                borderRightColor: currentPlacement === 'left' ? '#111827' : 'transparent',
              }}
              aria-hidden="true"
            />
          </div>,
          document.body
        )}
    </span>
  )
}
