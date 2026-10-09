import '@testing-library/jest-dom/vitest'
import { afterEach, vi } from 'vitest'
import { cleanup, configure } from '@testing-library/react'
import { writeToken } from '@/lib/session'

// Allow the real lazy chat module to load on slower Windows test workers.
configure({ asyncUtilTimeout: 5000 })

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    dispatchEvent() {
      return true
    },
  }),
})
Object.defineProperty(HTMLElement.prototype, 'scrollTo', { writable: true, value() {} })
vi.stubGlobal(
  'ResizeObserver',
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
)
if (!window.PointerEvent) window.PointerEvent = MouseEvent as typeof PointerEvent
Object.defineProperty(HTMLElement.prototype, 'hasPointerCapture', { value: () => false })
Object.defineProperty(HTMLElement.prototype, 'setPointerCapture', { value: () => {} })
Object.defineProperty(HTMLElement.prototype, 'releasePointerCapture', { value: () => {} })
afterEach(() => {
  cleanup()
  writeToken(null)
  sessionStorage.clear()
  localStorage.clear()
  vi.restoreAllMocks()
})
