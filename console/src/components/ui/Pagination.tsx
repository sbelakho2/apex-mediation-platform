import React from 'react'

type Props = {
  page: number
  totalPages: number
  onPageChange: (page: number) => void
  className?: string
}

export default function Pagination({ page, totalPages, onPageChange, className }: Props) {
  const hasPages = totalPages > 0
  const safePage = hasPages ? page : 0
  const canPrev = hasPages && safePage > 1
  const canNext = hasPages && safePage < totalPages
  return (
    <div
      className={`flex items-center justify-between ${className || ''}`}
      role="navigation"
      aria-label="Pagination"
    >
      <button
        type="button"
        onClick={() => canPrev && onPageChange(safePage - 1)}
        disabled={!canPrev}
        className="px-3 py-2 rounded border text-sm disabled:opacity-50 disabled:cursor-not-allowed"
        aria-label="Previous page"
      >
        Previous
      </button>

      <span
        className="text-sm text-gray-700"
        aria-live="polite"
        aria-current="page"
      >
        {hasPages ? (
          <>Page {safePage} of {totalPages}</>
        ) : (
          <>No pages</>
        )}
      </span>

      <button
        type="button"
        onClick={() => canNext && onPageChange(safePage + 1)}
        disabled={!canNext}
        className="px-3 py-2 rounded border text-sm disabled:opacity-50 disabled:cursor-not-allowed"
        aria-label="Next page"
      >
        Next
      </button>
    </div>
  )
}
