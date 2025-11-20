"use client"

import { useCallback, useState } from 'react'

export type DisclosureControls = {
  isOpen: boolean
  open: () => void
  close: () => void
  toggle: () => void
}

export function useDisclosure(initial = false): DisclosureControls {
  const [isOpen, setOpen] = useState<boolean>(initial)

  const open = useCallback(() => setOpen(true), [])
  const close = useCallback(() => setOpen(false), [])
  const toggle = useCallback(() => setOpen((v) => !v), [])

  return { isOpen, open, close, toggle }
}

export default useDisclosure
