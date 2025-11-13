declare module 'jest-axe' {
  export const axe: (node: Element | DocumentFragment, options?: unknown) => Promise<unknown>
  export const configureAxe: (options?: unknown) => typeof axe
}

declare module 'jest-axe/extend-expect' {}

declare namespace jest {
  interface Matchers<R> {
    toHaveNoViolations(): R
  }
}
