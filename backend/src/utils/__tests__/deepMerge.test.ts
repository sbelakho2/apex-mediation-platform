import { deepMerge } from '../deepMerge'

describe('deepMerge', () => {
  it('merges nested objects without clobbering unrelated keys', () => {
    const target = { a: { b: 1, c: 2 }, x: 9 } as const
    const source = { a: { b: 3 } }
    const merged = deepMerge(target as any, source as any) as any
    expect(merged).toEqual({ a: { b: 3, c: 2 }, x: 9 })
  })

  it('replaces arrays entirely (no concat)', () => {
    const target = { list: [1, 2, 3], obj: { arr: ['US'] } }
    const source = { list: [4], obj: { arr: ['CA', 'GB'] } }
    const merged = deepMerge(target as any, source as any) as any
    expect(merged).toEqual({ list: [4], obj: { arr: ['CA', 'GB'] } })
  })

  it('replaces primitive values directly', () => {
    const target = { a: 1, b: 'x', c: true }
    const source = { a: 2, b: 'y', c: false }
    const merged = deepMerge(target as any, source as any) as any
    expect(merged).toEqual({ a: 2, b: 'y', c: false })
  })

  it('omits undefined values from source (PATCH semantics)', () => {
    const target = { a: { b: 1, c: 2 } }
    const source = { a: { b: undefined as any } }
    const merged = deepMerge(target as any, source as any) as any
    // c remains, b remains unchanged because source provided undefined
    expect(merged).toEqual({ a: { b: 1, c: 2 } })
  })

  it('handles non-object targets or sources by source winning when defined', () => {
    expect(deepMerge(1 as any, 2 as any)).toBe(2)
    expect(deepMerge('a' as any, undefined as any)).toBe('a')
    expect(deepMerge(['x'] as any, ['y'] as any)).toEqual(['y'])
  })
})
