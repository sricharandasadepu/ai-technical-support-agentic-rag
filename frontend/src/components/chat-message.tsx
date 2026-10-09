import { useEffect, useMemo, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import type { Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import { visit } from 'unist-util-visit'
import type { Root, PhrasingContent } from 'mdast'
import {
  Check,
  CheckCheck,
  Copy,
  FileText,
  LifeBuoy,
  MessageCircleQuestion,
  ShieldCheck,
} from 'lucide-react'
import type { HistoryMessage, SourceReference, WorkflowStatus } from '@/lib/contracts'
import { cn, serverDate } from '@/lib/utils'
import { BrandMark } from './brand'
import { Button } from './ui/button'
import { Tooltip } from './ui/tooltip'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from './ui/dialog'

function citationPlugin(sources: SourceReference[]) {
  return () => (tree: Root) => {
    visit(tree, 'text', (node, index, parent) => {
      if (
        !parent ||
        index === undefined ||
        parent.type === 'link' ||
        parent.type === 'linkReference'
      )
        return
      const expression = /\[Source\s+(\d+)\]/g
      const parts: PhrasingContent[] = []
      let cursor = 0
      for (const match of node.value.matchAll(expression)) {
        if (!sources.some((source) => source.citation === `[Source ${match[1]}]`)) continue
        if (match.index > cursor)
          parts.push({ type: 'text', value: node.value.slice(cursor, match.index) })
        parts.push({
          type: 'link',
          url: `#nexadesk-source-${match[1]}`,
          children: [{ type: 'text', value: `[Source ${match[1]}]` }],
        })
        cursor = match.index + match[0].length
      }
      if (!parts.length) return
      if (cursor < node.value.length) parts.push({ type: 'text', value: node.value.slice(cursor) })
      const container = parent as { children: PhrasingContent[] }
      container.children.splice(index, 1, ...parts)
      return index + parts.length
    })
  }
}

const statusLabels: Record<WorkflowStatus, string> = {
  answered: 'Evidence-backed answer',
  clarification: 'A little more detail needed',
  greeting: 'Ready to help',
  out_of_scope: 'Outside support scope',
  escalated: 'Support follow-up recommended',
}

export type DisplayMessage = Omit<HistoryMessage, 'created_at'> & { created_at?: string }
const emptySources: SourceReference[] = []

export function ChatMessage({ message }: { message: DisplayMessage }) {
  const [selected, setSelected] = useState<SourceReference | null>(null)
  const [copied, setCopied] = useState(false)
  const [copyFailed, setCopyFailed] = useState(false)
  const sourceOpener = useRef<HTMLButtonElement | null>(null)
  const copyTimer = useRef<number | undefined>(undefined)
  useEffect(() => () => window.clearTimeout(copyTimer.current), [])
  const user = message.role === 'user'
  const sources = message.sources ?? emptySources
  // Keep Markdown component identities stable when a dialog or copy state changes,
  // so the citation button remains mounted and can receive restored focus.
  const markdownComponents = useMemo<Components>(
    () => ({
      a: ({ href, children }) => {
        const number = href?.match(/^#nexadesk-source-(\d+)$/)?.[1]
        const source = number
          ? sources.find((item) => item.citation === `[Source ${number}]`)
          : undefined
        if (source)
          return (
            <button
              type="button"
              className="citation-inline"
              onClick={(event) => {
                sourceOpener.current = event.currentTarget
                setSelected(source)
              }}
              aria-label={`Inspect Source ${number}`}
            >
              {children}
            </button>
          )
        if (!href || !/^https?:\/\//i.test(href)) return <span>{children}</span>
        return (
          <a href={href} target="_blank" rel="noopener noreferrer">
            {children}
          </a>
        )
      },
      table: ({ children }) => (
        <div className="overflow-x-auto">
          <table>{children}</table>
        </div>
      ),
      img: ({ alt }) => (
        <span className="text-muted-foreground">{alt ? `[Image: ${alt}]` : '[Image omitted]'}</span>
      ),
    }),
    [sources],
  )
  const date = message.created_at ? serverDate(message.created_at) : null
  const time =
    date && Number.isFinite(date.getTime())
      ? date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
      : null
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(message.content)
      setCopied(true)
      setCopyFailed(false)
      window.clearTimeout(copyTimer.current)
      copyTimer.current = window.setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopyFailed(true)
    }
  }
  if (user)
    return (
      <article aria-label="Your message" className="flex justify-end py-4">
        <div className="max-w-[88%] sm:max-w-[78%]">
          <div className="whitespace-pre-wrap break-words rounded-2xl rounded-tr-md border border-border/60 bg-user-bubble px-5 py-3.5 text-[14px] leading-6">
            {message.content}
          </div>
          {time && (
            <p className="mt-1.5 pr-1 text-right text-[10px] text-muted-foreground">{time}</p>
          )}
        </div>
      </article>
    )
  return (
    <article aria-label="NexaDesk AI response" className="py-5">
      <div className="mb-3 flex items-center gap-2.5">
        <BrandMark className="size-8 rounded-lg" />
        <span className="text-xs font-semibold">NexaDesk AI</span>
        {time && <span className="ml-1 text-[10px] text-muted-foreground">{time}</span>}
      </div>
      <div className="pl-0 sm:pl-[42px]">
        <div className="markdown-body prose prose-sm max-w-none break-words dark:prose-invert">
          <ReactMarkdown
            skipHtml
            remarkPlugins={[remarkGfm, citationPlugin(sources)]}
            rehypePlugins={[[rehypeHighlight, { detect: false, ignoreMissing: true }]]}
            components={markdownComponents}
          >
            {message.content}
          </ReactMarkdown>
        </div>
        {message.escalation_recommended && (
          <div
            className="mt-5 rounded-xl border border-amber-500/25 bg-amber-500/6 p-4"
            role="note"
            aria-label="Escalation recommendation"
          >
            <div className="flex items-start gap-3">
              <LifeBuoy className="mt-0.5 size-4 shrink-0 text-amber-700 dark:text-amber-300" />
              <div>
                <p className="text-xs font-semibold text-amber-900 dark:text-amber-200">
                  Support follow-up recommended
                </p>
                <p className="mt-1.5 text-sm leading-6 text-muted-foreground">
                  {message.escalation_reason ||
                    'There isn’t enough verified evidence to give you a reliable resolution.'}
                </p>
                <p className="mt-2 text-xs text-muted-foreground">
                  A recommendation only. No support ticket has been created.
                </p>
              </div>
            </div>
          </div>
        )}
        {!!sources.length && (
          <section
            className="mt-5 rounded-xl border border-border bg-surface p-3.5"
            aria-label="Answer sources"
          >
            <p className="mb-2.5 flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
              <FileText className="size-3" />
              Sources · {sources.length}
            </p>
            <div className="flex flex-wrap gap-2">
              {sources.map((source) => (
                <button
                  key={source.citation}
                  onClick={(event) => {
                    sourceOpener.current = event.currentTarget
                    setSelected(source)
                  }}
                  className="flex max-w-full items-center gap-2 rounded-lg border border-border/80 bg-background px-2.5 py-2 text-left transition-colors hover:border-primary/30 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label={`Open ${source.citation}: ${source.source}`}
                >
                  <span className="flex size-4 shrink-0 items-center justify-center rounded bg-primary/10 text-[9px] font-semibold text-primary">
                    {source.citation.match(/\d+/)?.[0]}
                  </span>
                  <span className="min-w-0">
                    <span className="block max-w-52 truncate text-[11px] font-medium">
                      {source.source.split('/').pop()}
                    </span>
                    {source.ticket_id && (
                      <span className="mt-0.5 block text-[10px] text-muted-foreground">
                        Ticket {source.ticket_id}
                      </span>
                    )}
                  </span>
                </button>
              ))}
            </div>
          </section>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Tooltip text={copied ? 'Copied' : 'Copy answer'}>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={copied ? 'Answer copied' : 'Copy answer'}
              onClick={() => void copy()}
            >
              {copied ? <Check className="!size-3.5" /> : <Copy className="!size-3.5" />}
            </Button>
          </Tooltip>
          {message.status && (
            <span
              className={cn(
                'flex items-center gap-1.5 text-[10px] text-muted-foreground',
                message.status === 'escalated' && 'text-amber-700 dark:text-amber-300',
              )}
            >
              {message.status === 'answered' ? (
                <ShieldCheck className="size-3" />
              ) : message.status === 'clarification' ? (
                <MessageCircleQuestion className="size-3" />
              ) : (
                <CheckCheck className="size-3" />
              )}
              {statusLabels[message.status]}
            </span>
          )}
          {copyFailed && (
            <span role="status" className="text-xs text-muted-foreground">
              Copy unavailable. Select the text to copy it.
            </span>
          )}
        </div>
      </div>
      <Dialog
        open={!!selected}
        onOpenChange={(open) => {
          if (!open) setSelected(null)
        }}
      >
        <DialogContent
          onCloseAutoFocus={(event) => {
            event.preventDefault()
            sourceOpener.current?.focus()
          }}
        >
          <span className="mb-4 flex size-10 items-center justify-center rounded-xl bg-primary/8 text-primary">
            <FileText className="size-5" />
          </span>
          <DialogTitle className="text-lg font-semibold">Source reference</DialogTitle>
          <DialogDescription className="mt-2 text-sm text-muted-foreground">
            Evidence retrieved for this answer.
          </DialogDescription>
          {selected && (
            <dl className="mt-6 space-y-4">
              <div>
                <dt className="source-label">Citation</dt>
                <dd className="mt-1 text-sm font-medium text-primary">{selected.citation}</dd>
              </div>
              <div>
                <dt className="source-label">Document</dt>
                <dd className="mt-1 break-all text-sm leading-6">{selected.source}</dd>
              </div>
              {selected.ticket_id && (
                <div>
                  <dt className="source-label">Support ticket reference</dt>
                  <dd className="mt-1 font-mono text-sm">{selected.ticket_id}</dd>
                </div>
              )}
              {selected.chunk_id && (
                <div>
                  <dt className="source-label">Chunk reference</dt>
                  <dd className="mt-1 break-all font-mono text-xs leading-5">
                    {selected.chunk_id}
                  </dd>
                </div>
              )}
            </dl>
          )}
          <p className="mt-6 border-t border-border pt-4 text-xs leading-5 text-muted-foreground">
            This identifies the supporting document. Full document previews are not available here.
          </p>
        </DialogContent>
      </Dialog>
    </article>
  )
}
