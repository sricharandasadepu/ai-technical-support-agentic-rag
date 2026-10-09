import { test, expect } from '@playwright/test'
import type { Page } from '@playwright/test'

const id = 'd30a769e-2338-49d7-aea4-2b019d8e46cf'

async function expectBrandImagesLoaded(page: Page) {
  const images = page.locator('img[src^="/branding/"]:visible')
  expect(await images.count()).toBeGreaterThan(0)
  await expect
    .poll(() =>
      images.evaluateAll((elements) =>
        elements.every((element) => {
          const image = element as HTMLImageElement
          if (!image.complete || !image.naturalWidth) return false
          const bounds = image.getBoundingClientRect()
          return (
            Math.abs(bounds.width / bounds.height - image.naturalWidth / image.naturalHeight) < 0.02
          )
        }),
      ),
    )
    .toBe(true)
}

async function authenticatedBackend(page: Page, initialTurns = 0) {
  await page.addInitScript(() => {
    const token = `${btoa('{}')}.${btoa(JSON.stringify({ sub: 'alex@example.com', exp: Math.floor(Date.now() / 1000) + 1800 }))}.test-signature`
    sessionStorage.setItem('nexadesk.access-token', token)
    if (!localStorage.getItem('nexadesk.theme')) localStorage.setItem('nexadesk.theme', 'light')
  })
  const messages: Record<string, unknown>[] = Array.from({ length: initialTurns }, (_, index) => [
    {
      role: 'user',
      content: `Support question ${index + 1}: help me verify the application host configuration.`,
      created_at: '2026-10-09T10:00:00Z',
      sources: [],
      escalation_recommended: false,
    },
    {
      role: 'assistant',
      content: `Review the documented configuration and verify the authentication worker before retrying request ${index + 1}.`,
      created_at: '2026-10-09T10:00:02Z',
      sources: [],
      status: 'answered',
      escalation_recommended: false,
    },
  ]).flat()
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url())
    const fulfill = (body: unknown) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
    if (url.pathname === '/api/auth/me')
      return fulfill({ name: 'Alex Morgan', email: 'alex@example.com' })
    if (url.pathname === '/api/rag/conversations')
      return fulfill({
        conversations: messages.length
          ? [
              {
                conversation_id: id,
                title: 'How do I fix NX-AUTH-4017?',
                created_at: '2026-10-09T10:00:00Z',
                updated_at: '2026-10-09T10:00:02Z',
                turn_count: messages.length / 2,
              },
            ]
          : [],
        offset: 0,
        limit: 20,
      })
    if (url.pathname === `/api/rag/conversations/${id}`)
      return fulfill({
        conversation_id: id,
        messages,
        total_turns: messages.length / 2,
        limit: 100,
        offset: 0,
      })
    if (url.pathname === '/api/rag/chat') {
      const body = route.request().postDataJSON() as { message: string }
      const sources = [
        {
          citation: '[Source 1]',
          source: 'faq/known_issues.json',
          chunk_id: 'test-chunk',
          ticket_id: 'NX-1001',
        },
      ]
      const answer =
        'Synchronize the application host using NTP, verify the server time, and restart the authentication worker. [Source 1]'
      messages.push(
        {
          role: 'user',
          content: body.message,
          created_at: '2026-10-09T10:00:00Z',
          sources: [],
          escalation_recommended: false,
        },
        {
          role: 'assistant',
          content: answer,
          created_at: '2026-10-09T10:00:02Z',
          sources,
          status: 'answered',
          escalation_recommended: false,
        },
      )
      return fulfill({
        answer,
        sources,
        conversation_id: id,
        status: 'answered',
        escalation_recommended: false,
        escalation_reason: null,
      })
    }
    return route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: '{"detail":"Not found"}',
    })
  })
}

test('responsive workspace, real contract chat, sources and theme', async ({ page }, testInfo) => {
  await authenticatedBackend(page)
  await page.goto('/app')
  await expect(page.getByRole('heading', { name: /A clear next step/ })).toBeVisible()
  await expectBrandImagesLoaded(page)
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  )
  expect(overflow).toBe(false)
  await page.screenshot({ path: testInfo.outputPath('workspace-light.png'), fullPage: true })
  if (testInfo.project.name === 'mobile') {
    await page.getByRole('button', { name: 'Open navigation' }).click()
    await expect(page.getByRole('dialog', { name: 'Workspace navigation' })).toBeVisible()
    await page.getByRole('button', { name: 'Close', exact: true }).click()
  }
  await page.getByRole('button', { name: /Troubleshoot a login issue/ }).click()
  await expect(page.getByRole('textbox', { name: 'Your NexaDesk question' })).toHaveValue(
    'How do I fix NX-AUTH-4017?',
  )
  await page.getByRole('button', { name: 'Send message' }).click()
  await expect(page).toHaveURL(new RegExp(`/app/conversations/${id}$`))
  await expect(
    page.getByText('Synchronize the application host using NTP', { exact: false }),
  ).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('chat-light.png'), fullPage: true })
  await page.getByRole('button', { name: 'Inspect Source 1' }).click()
  await expect(page.getByRole('dialog')).toContainText('faq/known_issues.json')
  await expect(page.getByRole('dialog')).toContainText('NX-1001')
  await page.keyboard.press('Escape')
  await expect(page.getByRole('button', { name: 'Inspect Source 1' })).toBeFocused()
  await page.getByRole('button', { name: 'Switch to dark theme' }).click()
  await expect(page.locator('html')).toHaveClass(/dark/)
  await expectBrandImagesLoaded(page)
  await page.screenshot({ path: testInfo.outputPath('chat-dark.png'), fullPage: true })
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.reload()
  await expect(
    page.getByText('Synchronize the application host using NTP', { exact: false }),
  ).toBeVisible()
  await expect(page.locator('html')).toHaveClass(/dark/)
  expect(errors).toEqual([])
})

test('login layout, accessible fields and keyboard validation', async ({ page }, testInfo) => {
  await page.goto('/login')
  await expect(page.getByRole('heading', { name: 'Sign in to your workspace' })).toBeVisible()
  await expectBrandImagesLoaded(page)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page.getByText('Enter a valid email address.')).toBeVisible()
  await expect(page.getByText('Enter your password.')).toBeVisible()
  await page.getByRole('button', { name: 'Show password' }).click()
  await expect(page.getByLabel('Password', { exact: true })).toHaveAttribute('type', 'text')
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(
    false,
  )
  await page.screenshot({ path: testInfo.outputPath('login.png'), fullPage: true })
})

test('enterprise shell keeps navigation and composer fixed while history scrolls', async ({
  page,
}, testInfo) => {
  await authenticatedBackend(page, 18)
  await page.goto(`/app/conversations/${id}`)
  await expect(page.getByRole('article', { name: 'Your message' })).toHaveCount(18)
  const header = page.getByRole('banner', { name: 'Workspace header' })
  await expect(header.getByRole('link', { name: 'NexaDesk AI workspace' })).toBeVisible()
  await expect(header.getByRole('button', { name: 'Open account menu' })).toBeVisible()
  await header.getByRole('button', { name: 'Open account menu' }).click()
  await expect(page.getByRole('menu')).toContainText('alex@example.com')
  await page.keyboard.press('Escape')

  if (testInfo.project.name !== 'mobile') {
    const sidebar = page.getByRole('complementary', { name: 'Workspace navigation' })
    expect((await sidebar.boundingBox())!.width).toBeGreaterThanOrEqual(260)
    expect((await sidebar.boundingBox())!.width).toBeLessThanOrEqual(280)
    await header.getByRole('button', { name: 'Collapse sidebar' }).click()
    await expect.poll(async () => (await sidebar.boundingBox())!.width).toBeLessThan(100)
    await header.getByRole('button', { name: 'Expand sidebar' }).click()
    await expect.poll(async () => (await sidebar.boundingBox())!.width).toBeGreaterThanOrEqual(260)
  } else {
    // The smaller end of supported mobile widths must keep all header controls usable.
    await page.setViewportSize({ width: 320, height: 740 })
    await header.getByRole('button', { name: 'Open navigation' }).click()
    const drawer = page.getByRole('dialog', { name: 'Workspace navigation' })
    await expect(drawer.getByRole('link', { name: 'New conversation' })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(header.getByRole('button', { name: 'Open navigation' })).toBeFocused()
    await page.screenshot({ path: testInfo.outputPath('chat-small-mobile.png'), fullPage: true })
  }

  const viewport = page.getByLabel('Conversation messages', { exact: true })
  const composer = page.getByLabel('Message composer', { exact: true })
  const initialHeader = (await header.boundingBox())!
  const initialComposer = (await composer.boundingBox())!
  expect(
    Math.abs(initialComposer.y + initialComposer.height - page.viewportSize()!.height),
  ).toBeLessThan(2)
  await expect
    .poll(() => viewport.evaluate((element) => element.scrollHeight > element.clientHeight))
    .toBe(true)
  await viewport.evaluate((element) => {
    element.scrollTop = 0
  })
  await expect.poll(() => viewport.evaluate((element) => element.scrollTop)).toBe(0)
  expect((await header.boundingBox())!.y).toBe(initialHeader.y)
  expect((await composer.boundingBox())!.y).toBe(initialComposer.y)
  const userBubble = (await page
    .getByRole('article', { name: 'Your message' })
    .first()
    .locator('div')
    .first()
    .boundingBox())!
  const assistant = (await page
    .getByRole('article', { name: 'NexaDesk AI response' })
    .first()
    .boundingBox())!
  expect(userBubble.x).toBeGreaterThan(assistant.x)
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(
    false,
  )
  await page.screenshot({ path: testInfo.outputPath('scrolling-history.png'), fullPage: true })
})
