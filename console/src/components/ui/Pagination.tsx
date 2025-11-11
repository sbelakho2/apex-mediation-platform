import React from 'react'

type Props = {
  page: number
  totalPages: number
  onPageChange: (page: number) => void
  className?: string
}

export default function Pagination({ page, totalPages, onPageChange, className }: Props) {
  const canPrev = page > 1
  const canNext = page < totalPages
  return (
    <div className={`flex items-center justify-between ${className || ''}`} role="navigation" aria-label="Pagination">
      <button
        type="button"
        onClick={() => canPrev && onPageChange(page - 1)}
        disabled={!canPrev}
        className="px-3 py-2 rounded border text-sm disabled:opacity-50 disabled:cursor-not-allowed"
        aria-label="Previous page"
      >
        Previous
      </button>

      <span className="text-sm text-gray-700" aria-live="polite">
        Page {page} of {Math.max(totalPages, 1)}
      </span>

      <button
        type="button"
        onClick={() => canNext && onPageChange(page + 1)}
        disabled={!canNext}
        className="px-3 py-2 rounded border text-sm disabled:opacity-50 disabled:cursor-not-allowed"
        aria-label="Next page"
      >
        Next
      </button>
    </div>
  )
}
