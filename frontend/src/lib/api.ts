import { z } from 'zod'
import {
  chatResponseSchema,
  conversationListSchema,
  historySchema,
  tokenSchema,
  userSchema,
} from './contracts'
import type { ChatRequest, LoginInput, RegisterInput } from './contracts'
import { expireSession, readToken, tokenExpiry } from './session'

const baseURL = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/$/, '')
const chatTimeout = Number(import.meta.env.VITE_CHAT_TIMEOUT_MS || 300000)

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number | null = null,
    public code: 'http' | 'network' | 'timeout' | 'aborted' | 'invalid_response' = 'http',
    public retryAfter: number | null = null,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

function errorMessage(status: number, detail: unknown): string {
  if (status === 422) return 'Please check the information you entered and try again.'
  if (status === 404) return 'This conversation is unavailable or does not belong to your account.'
  if (status === 409)
    return typeof detail === 'string'
      ? detail
      : 'This conversation changed. Refresh it before trying again.'
  if (status === 429) return 'Too many requests. Please wait a moment before trying again.'
  if (status >= 500) return 'NexaDesk support is temporarily unavailable. Please try again shortly.'
  if (status === 401 || status === 403)
    return 'Your session has expired. Sign in again to continue.'
  return 'The request could not be completed. Please try again.'
}

async function request<T>(
  path: string,
  schema: z.ZodType<T>,
  options: { body?: unknown; signal?: AbortSignal; authenticated?: boolean; timeout?: number } = {},
): Promise<T> {
  const authenticated = options.authenticated !== false
  const token = readToken()
  if (authenticated && (!token || !tokenExpiry(token) || tokenExpiry(token)! <= Date.now())) {
    expireSession()
    throw new ApiError('Your session has expired. Sign in again to continue.', 401)
  }
  const controller = new AbortController()
  let timedOut = false
  const abort = () => controller.abort()
  if (options.signal?.aborted) abort()
  else options.signal?.addEventListener('abort', abort, { once: true })
  const duration = options.timeout ?? 30000
  const timer = window.setTimeout(() => {
    timedOut = true
    controller.abort()
  }, duration)
  try {
    const response = await fetch(`${baseURL}${path}`, {
      method: options.body === undefined ? 'GET' : 'POST',
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(authenticated && token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      credentials: 'omit',
      cache: 'no-store',
    })
    const data: unknown = await response.json().catch((error: unknown) => {
      if (controller.signal.aborted) throw error
      return null
    })
    if (!response.ok) {
      if (authenticated && (response.status === 401 || response.status === 403)) expireSession()
      const detail = data && typeof data === 'object' && 'detail' in data ? data.detail : undefined
      const retryAfter = Number(response.headers.get('Retry-After'))
      throw new ApiError(
        errorMessage(response.status, detail),
        response.status,
        'http',
        retryAfter > 0 ? retryAfter : null,
      )
    }
    const result = schema.safeParse(data)
    if (!result.success)
      throw new ApiError(
        'The server returned an unexpected response. Please refresh and try again.',
        response.status,
        'invalid_response',
      )
    return result.data
  } catch (error) {
    if (error instanceof ApiError) throw error
    if (timedOut)
      throw new ApiError(
        'This request took too long. It may still complete. Refresh the conversation before resending your message.',
        null,
        'timeout',
      )
    if (controller.signal.aborted) throw new ApiError('Request cancelled.', null, 'aborted')
    throw new ApiError(
      'Unable to reach NexaDesk. Check your connection and try again.',
      null,
      'network',
    )
  } finally {
    window.clearTimeout(timer)
    options.signal?.removeEventListener('abort', abort)
  }
}

export const api = {
  async login(body: LoginInput) {
    try {
      return await request('/auth/login', tokenSchema, { body, authenticated: false })
    } catch (error) {
      if (error instanceof ApiError && error.status === 401)
        throw new ApiError('The email or password is incorrect.', 401)
      throw error
    }
  },
  async register(body: RegisterInput) {
    try {
      return await request('/auth/register', userSchema, { body, authenticated: false })
    } catch (error) {
      if (error instanceof ApiError && error.status === 409)
        throw new ApiError('An account with this email already exists. Sign in instead.', 409)
      throw error
    }
  },
  me: (signal?: AbortSignal) => request('/auth/me', userSchema, { signal }),
  conversations: (offset = 0, signal?: AbortSignal) =>
    request(`/rag/conversations?limit=20&offset=${offset}`, conversationListSchema, { signal }),
  // Backend conversations are bounded to 100 turns. One request restores complete history.
  history: (id: string, signal?: AbortSignal) =>
    request(`/rag/conversations/${encodeURIComponent(id)}?limit=100&offset=0`, historySchema, {
      signal,
    }),
  chat: (body: ChatRequest, signal?: AbortSignal) =>
    request('/rag/chat', chatResponseSchema, {
      body,
      signal,
      timeout: Number.isFinite(chatTimeout) && chatTimeout > 0 ? chatTimeout : 300000,
    }),
}
