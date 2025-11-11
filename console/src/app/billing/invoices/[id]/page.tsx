'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { getInvoice, downloadInvoicePDF, Invoice } from '@/lib/billing'
import Link from 'next/link'
import {
  ArrowLeft,
  Download,
  AlertCircle,
  FileText,
  CheckCircle,
  Clock,
  XCircle,
} from 'lucide-react'

export default function InvoiceDetailPage() {
  const params = useParams()
  const invoiceId = params?.id as string

  const [invoice, setInvoice] = useState<Invoice | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [downloading, setDownloading] = useState(false)

  useEffect(() => {
    if (invoiceId) {
      loadInvoice()
    }
  }, [invoiceId])

  const loadInvoice = async () => {
    try {
      setLoading(true)
      setError(null)
      const data = await getInvoice(invoiceId)
      setInvoice(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load invoice')
    } finally {
      setLoading(false)
    }
  }

  const handleDownloadPDF = async () => {
    try {
      setDownloading(true)
      const blobUrl = await downloadInvoicePDF(invoiceId)
      const link = document.createElement('a')
      link.href = blobUrl
      link.download = `invoice-${invoice?.invoice_number || invoiceId}.pdf`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(blobUrl)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to download PDF')
    } finally {
      setDownloading(false)
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'paid':
        return <CheckCircle className="h-6 w-6 text-green-600" />
      case 'open':
        return <Clock className="h-6 w-6 text-blue-600" />
      case 'void':
      case 'uncollectible':
        return <XCircle className="h-6 w-6 text-gray-600" />
      default:
        return <FileText className="h-6 w-6 text-gray-600" />
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'paid':
        return 'bg-green-100 text-green-800 border-green-200'
      case 'open':
        return 'bg-blue-100 text-blue-800 border-blue-200'
      case 'void':
      case 'uncollectible':
        return 'bg-gray-100 text-gray-800 border-gray-200'
      default:
        return 'bg-yellow-100 text-yellow-800 border-yellow-200'
    }
  }

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount)

  const formatDate = (dateString: string) =>
    new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })

  if (loading) {
    return (
      <div className="p-8">
        <div className="max-w-4xl mx-auto">
          <div className="animate-pulse space-y-6">
            <div className="h-8 w-64 bg-gray-200 rounded"></div>
            <div className="h-64 bg-gray-200 rounded-lg"></div>
          </div>
        </div>
      </div>
    )
  }

  if (error || !invoice) {
    return (
      <div className="p-8">
        <div className="max-w-4xl mx-auto">
          <Link
            href="/billing/invoices"
            className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 mb-6"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Invoices
          </Link>
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-red-600 mt-0.5" />
            <div>
              <h3 className="font-semibold text-red-900">Error Loading Invoice</h3>
              <p className="text-sm text-red-700 mt-1">{error || 'Invoice not found'}</p>
              <button
                onClick={loadInvoice}
                className="mt-3 text-sm font-medium text-red-700 hover:text-red-800"
              >
                Try Again
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Back Button */}
        <Link
          href="/billing/invoices"
          className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Invoices
        </Link>

        {/* Invoice Header */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-start justify-between gap-4 mb-6">
            <div className="flex items-center gap-4">
              {getStatusIcon(invoice.status)}
              <div>
                <h1 className="text-2xl font-bold text-gray-900">{invoice.invoice_number}</h1>
                <div className="flex items-center gap-3 mt-2">
                  <span
                    className={`px-3 py-1 text-sm font-medium border rounded-full ${getStatusColor(
                      invoice.status
                    )}`}
                  >
                    {invoice.status.toUpperCase()}
                  </span>
                  <span className="text-sm text-gray-600">
                    {invoice.currency.toUpperCase()}
                  </span>
                </div>
              </div>
            </div>
            <button
              onClick={handleDownloadPDF}
              disabled={downloading}
              className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition font-medium text-sm flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Download className="h-4 w-4" />
              {downloading ? 'Downloading...' : 'Download PDF'}
            </button>
          </div>

          {/* Invoice Details Grid */}
          <div className="grid grid-cols-2 gap-6 pt-6 border-t border-gray-200">
            <div>
              <h3 className="text-sm font-medium text-gray-600 mb-1">Amount</h3>
              <p className="text-2xl font-bold text-gray-900">{formatCurrency(invoice.amount)}</p>
            </div>
            <div>
              <h3 className="text-sm font-medium text-gray-600 mb-1">Billing Period</h3>
              <p className="text-gray-900">
                {formatDate(invoice.period_start)} - {formatDate(invoice.period_end)}
              </p>
            </div>
            {invoice.due_date && (
              <div>
                <h3 className="text-sm font-medium text-gray-600 mb-1">Due Date</h3>
                <p className="text-gray-900">{formatDate(invoice.due_date)}</p>
              </div>
            )}
            {invoice.paid_at && (
              <div>
                <h3 className="text-sm font-medium text-gray-600 mb-1">Paid On</h3>
                <p className="text-gray-900">{formatDate(invoice.paid_at)}</p>
              </div>
            )}
            <div>
              <h3 className="text-sm font-medium text-gray-600 mb-1">Created</h3>
              <p className="text-gray-900">{formatDate(invoice.created_at)}</p>
            </div>
            {invoice.stripe_invoice_id && (
              <div>
                <h3 className="text-sm font-medium text-gray-600 mb-1">Stripe Invoice ID</h3>
                <p className="text-xs text-gray-900 font-mono">{invoice.stripe_invoice_id}</p>
              </div>
            )}
          </div>
        </div>

        {/* Line Items */}
        {invoice.line_items && invoice.line_items.length > 0 && (
          <div className="bg-white rounded-lg border border-gray-200">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">Invoice Items</h2>
            </div>
            <div className="divide-y divide-gray-200">
              {invoice.line_items.map((item, index) => (
                <div key={index} className="p-6">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <h3 className="font-medium text-gray-900">{item.description}</h3>
                      <p className="text-sm text-gray-600 mt-1">
                        Quantity: {item.quantity.toLocaleString()} × {formatCurrency(item.unit_amount)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-semibold text-gray-900">
                        {formatCurrency(item.amount)}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="p-6 border-t border-gray-200 bg-gray-50">
              <div className="flex items-center justify-between">
                <span className="text-lg font-semibold text-gray-900">Total</span>
                <span className="text-2xl font-bold text-gray-900">
                  {formatCurrency(invoice.amount)}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Payment Status Message */}
        {invoice.status === 'open' && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <Clock className="h-5 w-5 text-blue-600 mt-0.5" />
              <div>
                <h3 className="font-semibold text-blue-900">Payment Pending</h3>
                <p className="text-sm text-blue-700 mt-1">
                  This invoice is awaiting payment. Payment will be automatically processed using
                  your default payment method.
                </p>
              </div>
            </div>
          </div>
        )}

        {invoice.status === 'paid' && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <CheckCircle className="h-5 w-5 text-green-600 mt-0.5" />
              <div>
                <h3 className="font-semibold text-green-900">Payment Received</h3>
                <p className="text-sm text-green-700 mt-1">
                  This invoice has been paid in full on {formatDate(invoice.paid_at!)}.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
