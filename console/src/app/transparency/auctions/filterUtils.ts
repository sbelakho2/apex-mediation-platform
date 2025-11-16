import { transparencyApi } from '@/lib/transparency'

export type AuctionsResponse = Awaited<ReturnType<typeof transparencyApi.list>>

export type TransparencyFilterParams = {
  from?: string
  to?: string
  placement_id?: string
  surface?: string
  geo?: string
}

export const TRANSPARENCY_AUCTION_PAGE_SIZE = 25

const ISO_8601_REGEX = /^(\d{4}-\d{2}-\d{2})([T\s]\d{2}:\d{2}(:\d{2})?(Z|[+-]\d{2}:?\d{2})?)?$/i

export const isValidIsoDate = (value: string): boolean => {
  if (!value) return false
  const trimmed = value.trim()
  if (!ISO_8601_REGEX.test(trimmed)) return false
  const parsed = Date.parse(trimmed)
  return Number.isFinite(parsed)
}

export const normalizeGeo = (value: string): string => value.replace(/[^a-z]/gi, '').toUpperCase().slice(0, 2)

export const isValidGeo = (value: string): boolean => /^[A-Z]{2}$/.test(value)

export const sanitizeFilters = (filters: TransparencyFilterParams): TransparencyFilterParams => {
  const clean: TransparencyFilterParams = {}
  if (filters.from && isValidIsoDate(filters.from)) clean.from = filters.from
  if (filters.to && isValidIsoDate(filters.to)) clean.to = filters.to
  if (filters.placement_id) clean.placement_id = filters.placement_id
  if (filters.surface) clean.surface = filters.surface
  if (filters.geo && isValidGeo(filters.geo)) clean.geo = filters.geo
  return clean
}

export const filtersEqual = (a: TransparencyFilterParams, b: TransparencyFilterParams): boolean => {
  const normalize = (value?: string) => value ?? ''
  return (
    normalize(a.from) === normalize(b.from) &&
    normalize(a.to) === normalize(b.to) &&
    normalize(a.placement_id) === normalize(b.placement_id) &&
    normalize(a.surface) === normalize(b.surface) &&
    normalize(a.geo) === normalize(b.geo)
  )
}
