import { describe, expect, it, vi } from 'vitest'
import { api, ApiError } from './api'
import { readToken, writeToken } from './session'
import { answered, jsonResponse, testToken } from '@/test/helpers'

describe('API client reliability', () => {
  it('rejects malformed successful responses', async () => {
    writeToken(testToken())
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({ answer: 'Missing contract fields' })),
    )
    await expect(api.chat({ message: 'Issue' })).rejects.toMatchObject({ code: 'invalid_response' })
  })
  it('clears bearer credentials on a protected 403', async () => {
    writeToken(testToken())
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({}, 403)))
    await expect(api.me()).rejects.toMatchObject({ status: 403 })
    expect(readToken()).toBeNull()
  })
  it('returns a safe error for network failures', async () => {
    writeToken(testToken())
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('sensitive-internal-error')))
    await expect(api.me()).rejects.toEqual(
      expect.objectContaining({
        code: 'network',
        message: 'Unable to reach NexaDesk. Check your connection and try again.',
      }),
    )
  })
  it('respects request cancellation', async () => {
    writeToken(testToken())
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url, options: RequestInit) =>
          new Promise((_resolve, reject) =>
            options.signal!.addEventListener('abort', () =>
              reject(new DOMException('Aborted', 'AbortError')),
            ),
          ),
      ),
    )
    const controller = new AbortController()
    const pending = api.chat({ message: 'Issue' }, controller.signal)
    controller.abort()
    await expect(pending).rejects.toMatchObject({ code: 'aborted' })
  })
  it('times out without automatically retrying a potentially persisted chat', async () => {
    vi.useFakeTimers()
    try {
      writeToken(testToken())
      const fetchMock = vi.fn(
        (_url, options: RequestInit) =>
          new Promise((_resolve, reject) =>
            options.signal!.addEventListener('abort', () =>
              reject(new DOMException('Aborted', 'AbortError')),
            ),
          ),
      )
      vi.stubGlobal('fetch', fetchMock)
      const expected = expect(api.chat({ message: 'Issue' })).rejects.toMatchObject({
        code: 'timeout',
      })
      await vi.advanceTimersByTimeAsync(300001)
      await expected
      expect(fetchMock).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })
  it('preserves returned source metadata and retry hints', async () => {
    writeToken(testToken())
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(answered))
      .mockResolvedValueOnce(jsonResponse({}, 503, { 'Retry-After': '10' }))
    vi.stubGlobal('fetch', fetchMock)
    expect((await api.chat({ message: 'Issue' })).sources).toEqual(answered.sources)
    try {
      await api.me()
      throw new Error('Expected an API failure')
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError)
      expect((error as ApiError).retryAfter).toBe(10)
    }
  })
  it('reports a timeout when headers arrive but the response body stalls', async () => {
    vi.useFakeTimers()
    try {
      writeToken(testToken())
      vi.stubGlobal(
        'fetch',
        vi.fn(async (_url, options: RequestInit) => ({
          ok: true,
          status: 200,
          json: () =>
            new Promise((_resolve, reject) =>
              options.signal!.addEventListener('abort', () =>
                reject(new DOMException('Aborted', 'AbortError')),
              ),
            ),
        })),
      )
      const expected = expect(api.me()).rejects.toMatchObject({ code: 'timeout' })
      await vi.advanceTimersByTimeAsync(30001)
      await expected
    } finally {
      vi.useRealTimers()
    }
  })
})
