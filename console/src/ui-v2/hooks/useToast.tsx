"use client"

import { createContext, useCallback, useContext, useMemo, useState } from 'react'

export type ToastIntent = 'info' | 'success' | 'error'

export type Toast = {
  id: string
  title?: string
  description?: string
  intent?: ToastIntent
  duration?: number
}

type ToastContextValue = {
  toasts: Toast[]
  show: (toast: Omit<Toast, 'id'>) => string
  dismiss: (id: string) => void
  clear: () => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const show = useCallback(
    ({ title, description, intent = 'info', duration = 4000 }: Omit<Toast, 'id'>) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      const toast: Toast = { id, title, description, intent, duration }
      setToasts((prev) => [...prev, toast])
      if (duration > 0) {
        window.setTimeout(() => dismiss(id), duration)
      }
      return id
    },
    [dismiss]
  )

  const clear = useCallback(() => setToasts([]), [])

  const value = useMemo(() => ({ toasts, show, dismiss, clear }), [toasts, show, dismiss, clear])

  return <ToastContext.Provider value={value}>{children}</ToastContext.Provider>
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within a ToastProvider')
  return ctx
}
