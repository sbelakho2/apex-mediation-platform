import React from 'react'

export type InvoiceStatusFilter = 'all' | 'draft' | 'open' | 'paid' | 'void' | 'uncollectible'

type Props = {
  status: InvoiceStatusFilter
  onStatusChange: (s: InvoiceStatusFilter) => void
  className?: string
}

export default function Filters({ status, onStatusChange, className }: Props) {
  return (
    <div className={`flex items-center gap-3 ${className || ''}`}>
      <label htmlFor="status" className="text-sm text-gray-700">
        Status
      </label>
      <select
        id="status"
        value={status}
  onChange={(e) => onStatusChange(e.target.value as InvoiceStatusFilter)}
        className="text-sm border rounded px-2 py-1"
        aria-label="Filter by invoice status"
      >
        <option value="all">All</option>
        <option value="open">Open</option>
        <option value="paid">Paid</option>
        <option value="void">Void</option>
        <option value="uncollectible">Uncollectible</option>
        <option value="draft">Draft</option>
      </select>
    </div>
  )
}
