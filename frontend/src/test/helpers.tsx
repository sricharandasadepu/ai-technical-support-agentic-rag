import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { vi } from 'vitest'
import { AppRoutes } from '@/app'
import { AuthProvider } from '@/auth/auth-context'
import { ThemeProvider } from '@/theme/theme-context'
import { TooltipProvider } from '@/components/ui/tooltip'
import { writeToken } from '@/lib/session'
import type { ChatResponse, ConversationHistory } from '@/lib/contracts'

export const conversationId = 'd30a769e-2338-49d7-aea4-2b019d8e46cf'
export const testUser = { name: 'Alex Morgan', email: 'alex@example.com' }
export function testToken(expiry = Date.now() + 1800000) {
  return `${btoa('{}')}.${btoa(JSON.stringify({ sub: testUser.email, exp: Math.floor(expiry / 1000) }))}.test-signature`
}
export function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  })
}
export const answered: ChatResponse = {
  answer: 'Synchronize the application host using NTP. [Source 1]',
  sources: [
    {
      citation: '[Source 1]',
      source: 'faq/known_issues.json',
      chunk_id: 'chunk-1',
      ticket_id: 'NX-1001',
    },
  ],
  conversation_id: conversationId,
  status: 'answered',
  escalation_recommended: false,
  escalation_reason: null,
}
export const initialHistory: ConversationHistory = {
  conversation_id: conversationId,
  messages: [
    {
      role: 'user',
      content: 'Login fails after restoring the host.',
      created_at: '2026-10-09T10:00:00Z',
      sources: [],
      escalation_recommended: false,
    },
    {
      role: 'assistant',
      content: answered.answer,
      created_at: '2026-10-09T10:00:02Z',
      sources: answered.sources,
      status: 'answered',
      escalation_recommended: false,
    },
  ],
  total_turns: 1,
  limit: 100,
  offset: 0,
}

// Test-only HTTP doubles. Production modules contain no mock API mode or data.
export function backendMock(
  options: {
    history?: ConversationHistory
    response?: ChatResponse
    chatStatus?: number
    listEmpty?: boolean
  } = {},
) {
  let history = structuredClone(options.history || initialHistory)
  const response = options.response || answered
  const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input), 'http://localhost')
    if (url.pathname === '/api/auth/me') return jsonResponse(testUser)
    if (url.pathname === '/api/auth/login')
      return jsonResponse({ access_token: testToken(), token_type: 'bearer' })
    if (url.pathname === '/api/auth/register') return jsonResponse(testUser, 201)
    if (url.pathname === '/api/rag/conversations')
      return jsonResponse({
        conversations: options.listEmpty
          ? []
          : [
              {
                conversation_id: conversationId,
                title: 'Login fails after restoring the host.',
                created_at: '2026-10-09T10:00:00Z',
                updated_at: '2026-10-09T10:00:02Z',
                turn_count: history.total_turns,
              },
            ],
        limit: 20,
        offset: Number(url.searchParams.get('offset')),
      })
    if (url.pathname === `/api/rag/conversations/${conversationId}`) return jsonResponse(history)
    if (url.pathname === '/api/rag/chat') {
      if (options.chatStatus)
        return jsonResponse({ detail: 'Provider-private-error' }, options.chatStatus)
      const request = JSON.parse(String(init?.body)) as {
        message: string
        conversation_id?: string
      }
      const previous = request.conversation_id ? history.messages : []
      history = {
        ...history,
        total_turns: request.conversation_id ? history.total_turns + 1 : 1,
        messages: [
          ...previous,
          {
            role: 'user',
            content: request.message,
            created_at: '2026-10-09T10:10:00Z',
            sources: [],
            escalation_recommended: false,
          },
          {
            role: 'assistant',
            content: response.answer,
            created_at: '2026-10-09T10:10:02Z',
            sources: response.sources,
            status: response.status,
            escalation_recommended: response.escalation_recommended,
            escalation_reason: response.escalation_reason,
          },
        ],
      }
      return jsonResponse(response)
    }
    throw new Error(`Unexpected test route: ${url.pathname}`)
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

export function renderApp(path = '/app', authenticated = true) {
  if (authenticated) writeToken(testToken())
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  })
  return {
    ...render(
      <QueryClientProvider client={client}>
        <ThemeProvider>
          <TooltipProvider>
            <AuthProvider>
              <MemoryRouter initialEntries={[path]}>
                <AppRoutes />
              </MemoryRouter>
            </AuthProvider>
          </TooltipProvider>
        </ThemeProvider>
      </QueryClientProvider>,
    ),
    client,
  }
}
