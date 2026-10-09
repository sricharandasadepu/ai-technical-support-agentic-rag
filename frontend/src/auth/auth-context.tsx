import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { api, ApiError } from '@/lib/api'
import type { LoginInput, User } from '@/lib/contracts'
import { readToken, SESSION_EXPIRED_EVENT, tokenExpiry, writeToken } from '@/lib/session'

type AuthState = {
  user: User | null
  status: 'loading' | 'authenticated' | 'anonymous' | 'unavailable'
  expired: boolean
  error?: string
}
type AuthContextValue = AuthState & {
  login: (input: LoginInput) => Promise<void>
  logout: () => void
  retry: () => void
}
const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const [revision, setRevision] = useState(0)
  const [state, setState] = useState<AuthState>(() => ({
    user: null,
    status: readToken() ? 'loading' : 'anonymous',
    expired: false,
  }))
  const reset = useCallback(
    (expired = false) => {
      writeToken(null)
      void queryClient.cancelQueries()
      queryClient.clear()
      setState({ user: null, status: 'anonymous', expired })
    },
    [queryClient],
  )

  useEffect(() => {
    const token = readToken()
    if (!token) return
    const controller = new AbortController()
    api
      .me(controller.signal)
      .then((user) => {
        if (!controller.signal.aborted && readToken() === token)
          setState({ user, status: 'authenticated', expired: false })
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        if (error instanceof ApiError && (error.status === 401 || error.status === 403)) reset(true)
        else
          setState({
            user: null,
            status: 'unavailable',
            expired: false,
            error: error instanceof Error ? error.message : 'Unable to verify your session.',
          })
      })
    return () => controller.abort()
  }, [revision, reset])

  useEffect(() => {
    const onExpired = () => reset(true)
    window.addEventListener(SESSION_EXPIRED_EVENT, onExpired)
    const token = readToken()
    const expiry = token ? tokenExpiry(token) : null
    const timer =
      expiry && state.status === 'authenticated'
        ? window.setTimeout(onExpired, Math.max(0, Math.min(expiry - Date.now(), 2147483647)))
        : undefined
    return () => {
      window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired)
      window.clearTimeout(timer)
    }
  }, [reset, state.status, revision])

  const login = async (input: LoginInput) => {
    const response = await api.login(input)
    writeToken(response.access_token)
    try {
      const user = await api.me()
      queryClient.clear()
      setState({ user, status: 'authenticated', expired: false })
    } catch (error) {
      reset(false)
      throw error
    }
  }
  return (
    <AuthContext.Provider
      value={{
        ...state,
        login,
        logout: () => reset(false),
        retry: () => {
          setState({ user: null, status: 'loading', expired: false })
          setRevision((value) => value + 1)
        },
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const value = useContext(AuthContext)
  if (!value) throw new Error('AuthProvider is required')
  return value
}
