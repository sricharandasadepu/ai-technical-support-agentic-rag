import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { backendMock, jsonResponse, renderApp, testToken, testUser } from '@/test/helpers'
import { readToken, writeToken } from '@/lib/session'

describe('authentication and protected routes', () => {
  it('redirects unauthenticated visitors to sign in', async () => {
    const fetchMock = backendMock()
    renderApp('/app', false)
    expect(await screen.findByRole('heading', { name: 'Sign in to your workspace' })).toBeVisible()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('uses JSON login, verifies the user, and opens the workspace', async () => {
    const fetchMock = backendMock({ listEmpty: true })
    const user = userEvent.setup()
    renderApp('/login', false)
    await user.type(screen.getByLabelText('Email address'), testUser.email)
    await user.type(screen.getByLabelText('Password', { exact: true }), 'safe-test-password')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByRole('heading', { name: /A clear next step/ })).toBeVisible()
    const login = fetchMock.mock.calls.find(([url]) => String(url).endsWith('/auth/login'))!
    expect(JSON.parse(String(login[1]?.body))).toEqual({
      email: testUser.email,
      password: 'safe-test-password',
    })
    expect(login[1]?.headers).not.toHaveProperty('Authorization')
    expect(readToken()).toBeTruthy()
    expect(sessionStorage.getItem('nexadesk.access-token')).toBeTruthy()
    expect(localStorage.getItem('nexadesk.access-token')).toBeNull()
  })

  it('validates registration and then requires a separate login', async () => {
    const fetchMock = backendMock()
    const user = userEvent.setup()
    renderApp('/register', false)
    await user.type(screen.getByLabelText('Full name'), testUser.name)
    await user.type(screen.getByLabelText('Email address'), testUser.email)
    await user.type(screen.getByLabelText('Password', { exact: true }), 'short')
    await user.click(screen.getByRole('button', { name: 'Create account' }))
    expect(await screen.findByText('Use at least 8 characters.')).toBeVisible()
    expect(fetchMock).not.toHaveBeenCalled()
    await user.clear(screen.getByLabelText('Password', { exact: true }))
    await user.type(screen.getByLabelText('Password', { exact: true }), 'safe-test-password')
    await user.click(screen.getByRole('button', { name: 'Create account' }))
    expect(
      await screen.findByText('Account created. Sign in with your new credentials.'),
    ).toBeVisible()
    expect(readToken()).toBeNull()
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({
      name: testUser.name,
      email: testUser.email,
      password: 'safe-test-password',
    })
  })

  it('supports the password visibility toggle', async () => {
    backendMock()
    const user = userEvent.setup()
    renderApp('/login', false)
    expect(screen.getByLabelText('Password', { exact: true })).toHaveAttribute('type', 'password')
    await user.click(screen.getByRole('button', { name: 'Show password' }))
    expect(screen.getByLabelText('Password', { exact: true })).toHaveAttribute('type', 'text')
  })

  it('shows invalid credentials without storing a token', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({ detail: 'Invalid email or password.' }, 401)),
    )
    const user = userEvent.setup()
    renderApp('/login', false)
    await user.type(screen.getByLabelText('Email address'), testUser.email)
    await user.type(screen.getByLabelText('Password', { exact: true }), 'wrong-test-password')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The email or password is incorrect.',
    )
    expect(readToken()).toBeNull()
  })

  it('rejects locally expired sessions without a protected request', async () => {
    const fetchMock = backendMock()
    writeToken(testToken(Date.now() - 60000))
    renderApp('/app', false)
    expect(
      await screen.findByText('Your session expired. Sign in again to continue.'),
    ).toBeVisible()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('expires sessions on an authenticated 401', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ detail: 'Expired' }, 401)))
    renderApp()
    expect(await screen.findByRole('heading', { name: 'Sign in to your workspace' })).toBeVisible()
    expect(readToken()).toBeNull()
  })

  it('retains the session on a server outage and allows retry', async () => {
    const fetchMock = backendMock()
    fetchMock.mockImplementationOnce(async () => jsonResponse({ detail: 'Unavailable' }, 503))
    const user = userEvent.setup()
    renderApp()
    expect(await screen.findByRole('alert')).toBeVisible()
    expect(readToken()).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('heading', { name: /A clear next step/ })).toBeVisible()
  })

  it('clears tokens and user queries on sign out', async () => {
    backendMock()
    const user = userEvent.setup()
    const { client } = renderApp()
    await screen.findByRole('heading', { name: /A clear next step/ })
    await user.click(screen.getByRole('button', { name: 'Open account menu' }))
    await user.click(screen.getByRole('menuitem', { name: 'Sign out' }))
    expect(await screen.findByRole('heading', { name: 'Sign in to your workspace' })).toBeVisible()
    await waitFor(() => expect(client.getQueryCache().getAll()).toHaveLength(0))
    expect(readToken()).toBeNull()
  })
})
