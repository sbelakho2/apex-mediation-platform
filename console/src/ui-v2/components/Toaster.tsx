"use client"

import { useEffect } from 'react'
import { useToast, type Toast } from '@/ui-v2/hooks/useToast'
import clsx from 'clsx'

export function Toaster() {
  const { toasts, dismiss } = useToast()

  // Allow Escape to clear the latest toast for convenience
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && toasts.length > 0) {
        const last = toasts[toasts.length - 1]
        dismiss(last.id)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [toasts, dismiss])

  if (toasts.length === 0) return null

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-[60] mx-auto flex max-w-7xl justify-end px-4 pb-4 sm:px-6 lg:px-8"
      aria-live="polite"
      aria-relevant="additions text"
    >
      <div className="flex w-full flex-col items-end gap-2">
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} onClose={() => dismiss(t.id)} />
        ))}
      </div>
    </div>
  )
}

function ToastItem({ toast, onClose }: { toast: Toast; onClose: () => void }) {
  const intent = toast.intent ?? 'info'
  const intentCls = intentClasses(intent)
  return (
    <div
      role="status"
      className={clsx(
        'w-full max-w-sm rounded-[var(--radius-md)] border shadow-[var(--shadow-sm)] backdrop-blur',
        'px-4 py-3',
        intentCls.container
      )}
    >
      <div className="flex items-start gap-3">
        <div className={clsx('mt-0.5 h-5 w-5 flex-shrink-0', intentCls.icon)} aria-hidden>
          {intent === 'success' ? SuccessIcon : intent === 'error' ? ErrorIcon : InfoIcon}
        </div>
        <div className="min-w-0 flex-1">
          {toast.title && (
            <p className={clsx('text-sm font-medium', intentCls.title)}>{toast.title}</p>
          )}
          {toast.description && (
            <p className={clsx('mt-0.5 text-sm', intentCls.description)}>{toast.description}</p>
          )}
        </div>
        <button
          className={clsx(
            'ml-2 inline-flex h-6 w-6 items-center justify-center rounded focus-visible:outline-none',
            'focus-visible:[box-shadow:var(--focus-ring)]',
            intentCls.close
          )}
          aria-label="Dismiss notification"
          onClick={onClose}
        >
          <span aria-hidden className="text-lg leading-none">×</span>
        </button>
      </div>
    </div>
  )
}

function intentClasses(intent: 'info' | 'success' | 'error') {
  switch (intent) {
    case 'success':
      return {
        container: 'border-emerald-300/40 bg-emerald-50/90 dark:border-emerald-900/40 dark:bg-emerald-900/30',
        title: 'text-emerald-900 dark:text-emerald-200',
        description: 'text-emerald-800 dark:text-emerald-300',
        icon: 'text-emerald-600 dark:text-emerald-300',
        close: 'text-emerald-700 hover:bg-emerald-100/60 dark:text-emerald-200 dark:hover:bg-emerald-800/60',
      }
    case 'error':
      return {
        container: 'border-red-300/40 bg-red-50/90 dark:border-red-900/40 dark:bg-red-900/30',
        title: 'text-red-900 dark:text-red-200',
        description: 'text-red-800 dark:text-red-300',
        icon: 'text-red-600 dark:text-red-300',
        close: 'text-red-700 hover:bg-red-100/60 dark:text-red-200 dark:hover:bg-red-800/60',
      }
    case 'info':
    default:
      return {
        container: 'border-zinc-300/40 bg-white/90 dark:border-zinc-700/60 dark:bg-zinc-900/70',
        title: 'text-zinc-900 dark:text-zinc-100',
        description: 'text-zinc-700 dark:text-zinc-300',
        icon: 'text-zinc-600 dark:text-zinc-300',
        close: 'text-zinc-700 hover:bg-zinc-100/60 dark:text-zinc-200 dark:hover:bg-zinc-800/60',
      }
  }
}

const SuccessIcon = (
  <svg viewBox="0 0 20 20" fill="currentColor">
    <path
      fillRule="evenodd"
      d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.707a1 1 0 00-1.414-1.414L9 10.172 7.707 8.879a1 1 0 10-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
      clipRule="evenodd"
    />
  </svg>
)

const ErrorIcon = (
  <svg viewBox="0 0 20 20" fill="currentColor">
    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9 9V5h2v4H9zm0 2h2v4H9v-4z" clipRule="evenodd" />
  </svg>
)

const InfoIcon = (
  <svg viewBox="0 0 20 20" fill="currentColor">
    <path d="M10 3.5a6.5 6.5 0 100 13 6.5 6.5 0 000-13zM9 9h2v6H9V9zm0-3h2v2H9V6z" />
  </svg>
)

export default Toaster
