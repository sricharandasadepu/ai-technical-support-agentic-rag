const KEY = 'nexadesk.access-token'
export const SESSION_EXPIRED_EVENT = 'nexadesk:session-expired'
let memoryToken: string | null = null

export function readToken(): string | null {
  try {
    return sessionStorage.getItem(KEY) ?? memoryToken
  } catch {
    return memoryToken
  }
}

export function writeToken(token: string | null) {
  memoryToken = token
  try {
    if (token) sessionStorage.setItem(KEY, token)
    else sessionStorage.removeItem(KEY)
  } catch {
    /* Memory-only fallback when storage is disabled. */
  }
}

// Expiry is a UX hint only. The backend still verifies signature, expiry and user.
export function tokenExpiry(token: string): number | null {
  try {
    const raw = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    const payload = JSON.parse(atob(raw.padEnd(Math.ceil(raw.length / 4) * 4, '='))) as {
      exp?: unknown
    }
    return typeof payload.exp === 'number' && Number.isFinite(payload.exp)
      ? payload.exp * 1000
      : null
  } catch {
    return null
  }
}

export function expireSession() {
  writeToken(null)
  window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT))
}
