import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ChatMessage } from './chat-message'
import { TooltipProvider } from './ui/tooltip'
import { answered } from '@/test/helpers'

function message(content = answered.answer) {
  return render(
    <TooltipProvider>
      <ChatMessage
        message={{
          role: 'assistant',
          content,
          sources: answered.sources,
          status: 'answered',
          escalation_recommended: false,
        }}
      />
    </TooltipProvider>,
  )
}

describe('grounded answer rendering', () => {
  it('copies the complete answer and confirms success', async () => {
    const user = userEvent.setup()
    const clipboard = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined)
    message()
    await user.click(screen.getByRole('button', { name: 'Copy answer' }))
    expect(clipboard).toHaveBeenCalledWith(answered.answer)
    expect(screen.getByRole('button', { name: 'Answer copied' })).toBeVisible()
  })
  it('renders clickable inline citations and their exact document/ticket references', async () => {
    const user = userEvent.setup()
    message()
    await user.click(screen.getByRole('button', { name: 'Inspect Source 1' }))
    expect(screen.getByRole('dialog')).toHaveTextContent('faq/known_issues.json')
    expect(screen.getByRole('dialog')).toHaveTextContent('NX-1001')
    expect(screen.queryByRole('link', { name: /known_issues/ })).not.toBeInTheDocument()
    await user.keyboard('{Escape}')
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Inspect Source 1' })).toHaveFocus(),
    )
  })
  it('does not invent clickable citations for absent sources', () => {
    message('A reference that was not returned [Source 99].')
    expect(screen.queryByRole('button', { name: 'Inspect Source 99' })).not.toBeInTheDocument()
  })
  it('discards raw HTML and unsafe links', () => {
    const { container } = message(
      '<script>alert(1)</script>\n\n[Unsafe](javascript:alert(1))\n\n<img src=x onerror=alert(1)>',
    )
    expect(container.querySelector('script')).toBeNull()
    expect(container.querySelector('[onerror]')).toBeNull()
    expect(screen.queryByRole('link', { name: 'Unsafe' })).not.toBeInTheDocument()
  })
  it('does not fetch remote images from generated Markdown', () => {
    const { container } = message('![External image](https://example.com/tracker.png)')
    expect(container.querySelector('.markdown-body img')).toBeNull()
    expect(container.querySelector('img[src^="http"]')).toBeNull()
    expect(screen.getByText('[Image: External image]')).toBeVisible()
  })
  it('renders Markdown tables and highlighted code without execution', () => {
    const { container } = message(
      '| Field | Value |\n| --- | --- |\n| Status | Ready |\n\n```json\n{"ready":true}\n```',
    )
    expect(screen.getByRole('table')).toHaveTextContent('Status')
    expect(container.querySelector('pre code')).toHaveTextContent('"ready"')
    expect(container.querySelector('pre code .hljs-attr')).not.toBeNull()
  })
})
