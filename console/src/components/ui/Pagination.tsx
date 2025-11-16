'use client'

import { useEffect, useMemo, useState } from 'react'

type Props = {
  page: number
  totalPages: number
  onPageChange: (page: number) => void
  className?: string
}

export default function Pagination({ page, totalPages, onPageChange, className }: Props) {
  const { hasPages, safePage, safeTotalPages } = useMemo(() => {
    const clampedTotal = Math.max(totalPages, 0)
    const pagesAvailable = clampedTotal > 0
    const clampedPage = pagesAvailable
      ? Math.min(Math.max(page, 1), clampedTotal)
      : 0
    return {
      hasPages: pagesAvailable,
      safePage: clampedPage,
      safeTotalPages: clampedTotal,
    }
  }, [page, totalPages])

  const [inputValue, setInputValue] = useState(hasPages ? String(safePage) : '')

  useEffect(() => {
    setInputValue(hasPages ? String(safePage) : '')
  }, [hasPages, safePage])

  const goToPage = (nextPage: number) => {
    if (!hasPages) return
    const clamped = Math.min(Math.max(nextPage, 1), safeTotalPages)
    if (clamped !== safePage) {
      onPageChange(clamped)
    }
  }

  const canPrev = hasPages && safePage > 1
  const canNext = hasPages && safePage < safeTotalPages
  const canFirst = canPrev
  const canLast = hasPages && safePage < safeTotalPages

  const handleInputCommit = () => {
    if (!hasPages) return
    const parsed = Number(inputValue)
    if (!Number.isFinite(parsed)) return
    goToPage(parsed)
  }

  const sharedButtonClasses =
    'px-3 py-2 rounded border text-sm disabled:opacity-50 disabled:cursor-not-allowed'

  return (
    <div
      className={`flex flex-wrap items-center gap-3 justify-between ${className || ''}`}
      role="navigation"
      aria-label="Pagination"
    >
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => goToPage(1)}
          disabled={!canFirst}
          className={sharedButtonClasses}
          aria-label="Go to first page"
        >
          First
        </button>
        <button
          type="button"
          onClick={() => goToPage(safePage - 1)}
          disabled={!canPrev}
          className={sharedButtonClasses}
          aria-label="Previous page"
        >
          Previous
        </button>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => goToPage(safePage + 1)}
          disabled={!canNext}
          className={sharedButtonClasses}
          aria-label="Next page"
        >
          Next
        </button>
        <button
          type="button"
          onClick={() => goToPage(safeTotalPages)}
          disabled={!canLast}
          className={sharedButtonClasses}
          aria-label="Go to last page"
        >
          Last
        </button>
      </div>

      <div className="flex items-center gap-2 text-sm text-gray-700" aria-live="polite">
        {hasPages ? (
          <>
            <label className="flex items-center gap-2">
              <span className="sr-only">Current page</span>
              <input
                type="number"
                min={1}
                max={safeTotalPages}
                value={inputValue}
                onChange={(event) => setInputValue(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    handleInputCommit()
                  }
                }}
                onBlur={handleInputCommit}
                aria-label="Go to page"
                className="w-16 rounded border px-2 py-1 text-center text-sm"
                disabled={!hasPages}
                inputMode="numeric"
              />
            </label>
            <span aria-current="page">
              of {safeTotalPages}
            </span>
          </>
        ) : (
          <span aria-live="polite">No pages</span>
        )}
      </div>
    </div>
  )
}
