import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { backendMock, conversationId, renderApp, answered, jsonResponse } from '@/test/helpers'

describe('integrated support workspace', () => {
  it('submits a new chat and preserves the backend conversation ID', async () => {
    const fetchMock = backendMock({ listEmpty: true })
    const user = userEvent.setup()
    renderApp()
    const input = await screen.findByRole('textbox', { name: 'Your NexaDesk question' })
    await user.type(input, 'How do I fix NX-AUTH-4017?{Enter}')
    expect(await screen.findByText(/Synchronize the application host using NTP/)).toBeVisible()
    const chat = fetchMock.mock.calls.find(([url]) => String(url).endsWith('/rag/chat'))!
    expect(JSON.parse(String(chat[1]?.body))).toEqual({ message: 'How do I fix NX-AUTH-4017?' })
    expect(chat[1]?.headers).toHaveProperty('Authorization')
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(([url]) =>
          String(url).includes(`/conversations/${conversationId}?limit=100&offset=0`),
        ),
      ).toBe(true),
    )
  })

  it('loads complete history and sends follow-ups to the same conversation', async () => {
    const fetchMock = backendMock()
    const user = userEvent.setup()
    renderApp(`/app/conversations/${conversationId}`)
    await screen.findByText(/Synchronize the application host using NTP/)
    expect(screen.getByRole('article', { name: 'Your message' })).toHaveTextContent(
      'Login fails after restoring the host.',
    )
    await user.type(
      screen.getByRole('textbox', { name: 'Your NexaDesk question' }),
      'What should I verify next?{Enter}',
    )
    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith('/rag/chat'))).toBe(true),
    )
    const chat = fetchMock.mock.calls.find(([url]) => String(url).endsWith('/rag/chat'))!
    expect(JSON.parse(String(chat[1]?.body))).toEqual({
      message: 'What should I verify next?',
      conversation_id: conversationId,
    })
    expect(await screen.findByText('What should I verify next?')).toBeVisible()
  })

  it('keeps Shift+Enter as a newline without sending', async () => {
    const fetchMock = backendMock({ listEmpty: true })
    const user = userEvent.setup()
    renderApp()
    const input = await screen.findByRole('textbox', { name: 'Your NexaDesk question' })
    await user.type(input, 'First line{Shift>}{Enter}{/Shift}Second line')
    expect(input).toHaveValue('First line\nSecond line')
    expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith('/rag/chat'))).toBe(false)
  })

  it('fills suggestions without automatically sending', async () => {
    const fetchMock = backendMock({ listEmpty: true })
    const user = userEvent.setup()
    renderApp()
    await user.click(await screen.findByRole('button', { name: /Troubleshoot a login issue/ }))
    expect(screen.getByRole('textbox', { name: 'Your NexaDesk question' })).toHaveValue(
      'How do I fix NX-AUTH-4017?',
    )
    expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith('/rag/chat'))).toBe(false)
  })

  it('shows escalation and never implies a ticket was created', async () => {
    backendMock({
      response: {
        ...answered,
        sources: [],
        status: 'escalated',
        escalation_recommended: true,
        escalation_reason: 'The available evidence does not document a resolution.',
        answer: 'I could not verify enough evidence to answer safely.',
      },
    })
    const user = userEvent.setup()
    renderApp()
    await user.type(
      await screen.findByRole('textbox', { name: 'Your NexaDesk question' }),
      'Unknown issue{Enter}',
    )
    expect(
      await screen.findByRole('note', { name: 'Escalation recommendation' }),
    ).toHaveTextContent('The available evidence does not document a resolution.')
    expect(screen.getByRole('note')).toHaveTextContent('No support ticket has been created.')
  })

  it('retains the draft after a 503 and exposes explicit retry', async () => {
    const fetchMock = backendMock({ chatStatus: 503 })
    const user = userEvent.setup()
    renderApp()
    const input = await screen.findByRole('textbox', { name: 'Your NexaDesk question' })
    await user.type(input, 'Please help with login{Enter}')
    expect(await screen.findByRole('alert')).toHaveTextContent('temporarily unavailable')
    expect(input).toHaveValue('Please help with login')
    expect(screen.getByRole('button', { name: 'Retry message' })).toBeEnabled()
    expect(screen.queryByText('Provider-private-error')).not.toBeInTheDocument()
    expect(fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/rag/chat'))).toHaveLength(
      1,
    )
  })

  it('disables send while processing a normal HTTP response', async () => {
    const fetchMock = backendMock()
    const original = fetchMock.getMockImplementation()!
    let resolveChat!: (response: Response) => void
    fetchMock.mockImplementation((url, init) =>
      String(url).endsWith('/rag/chat')
        ? new Promise<Response>((resolve) => {
            resolveChat = resolve
          })
        : original(url, init),
    )
    const user = userEvent.setup()
    renderApp()
    await user.type(
      await screen.findByRole('textbox', { name: 'Your NexaDesk question' }),
      'Help with login{Enter}',
    )
    expect(await screen.findByText('Finding a grounded answer…')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Send message' })).toBeDisabled()
    resolveChat(jsonResponse(answered))
    expect(await screen.findByText(/Synchronize the application host using NTP/)).toBeVisible()
  })

  it('filters locally loaded conversations', async () => {
    backendMock()
    const user = userEvent.setup()
    renderApp()
    const link = await screen.findByRole('link', { name: 'Login fails after restoring the host.' })
    expect(link).toBeVisible()
    await user.type(
      screen.getByRole('textbox', { name: 'Search loaded conversations' }),
      'not found',
    )
    expect(
      screen.queryByRole('link', { name: 'Login fails after restoring the host.' }),
    ).not.toBeInTheDocument()
    expect(screen.getByText('No matching conversations')).toBeVisible()
  })
})
