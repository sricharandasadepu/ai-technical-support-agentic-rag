import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowDown, Loader2, RefreshCw } from 'lucide-react'
import { z } from 'zod'
import { api, ApiError } from '@/lib/api'
import type { ConversationHistory, HistoryMessage } from '@/lib/contracts'
import { historyKey } from '@/lib/utils'
import { Welcome } from '@/components/welcome'
import { Composer } from '@/components/composer'
import { ChatMessage } from '@/components/chat-message'
import { BrandMark } from '@/components/brand'
import { ErrorState } from '@/components/error-state'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/input'

export function ChatPage() {
  const { conversationId } = useParams()
  const location = useLocation()
  if (conversationId && !z.uuid().safeParse(conversationId).success)
    return (
      <div className="p-8">
        <ErrorState message="This conversation link is invalid. Start a new conversation from the sidebar." />
      </div>
    )
  return <ChatSession key={conversationId || location.key} conversationId={conversationId} />
}

function ChatSession({ conversationId }: { conversationId?: string }) {
  const [draft, setDraft] = useState('')
  const [pendingText, setPendingText] = useState<string | null>(null)
  const [failure, setFailure] = useState<string | null>(null)
  const [follow, setFollow] = useState(true)
  const [slow, setSlow] = useState(false)
  const viewport = useRef<HTMLDivElement>(null)
  const controller = useRef<AbortController | null>(null)
  const mounted = useRef(true)
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const history = useQuery({
    queryKey: historyKey(conversationId || 'new'),
    queryFn: ({ signal }) => api.history(conversationId!, signal),
    enabled: !!conversationId,
  })
  const mutation = useMutation({
    mutationFn: ({ message, signal }: { message: string; signal: AbortSignal }) =>
      api.chat({ message, ...(conversationId ? { conversation_id: conversationId } : {}) }, signal),
    retry: false,
  })
  const messages = history.data?.messages ?? []
  const loading = !!conversationId && history.isPending
  const busy = mutation.isPending
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      controller.current?.abort()
    }
  }, [])
  useEffect(() => {
    if (!busy) return
    const timer = window.setTimeout(() => setSlow(true), 20000)
    return () => window.clearTimeout(timer)
  }, [busy])
  useEffect(() => {
    if (follow) viewport.current?.scrollTo({ top: viewport.current.scrollHeight, behavior: 'auto' })
  }, [messages.length, history.dataUpdatedAt, busy, follow])

  const send = async () => {
    const message = draft.trim()
    if (!message || message.length > 4000 || busy || loading || history.isError) return
    setFailure(null)
    setSlow(false)
    setDraft('')
    setPendingText(message)
    setFollow(true)
    controller.current = new AbortController()
    try {
      const result = await mutation.mutateAsync({ message, signal: controller.current.signal })
      if (!mounted.current) return
      if (conversationId && result.conversation_id !== conversationId)
        throw new ApiError(
          'The server returned a different conversation. Refresh before continuing.',
          null,
          'invalid_response',
        )
      const now = new Date().toISOString()
      const userMessage: HistoryMessage = {
        role: 'user',
        content: message,
        created_at: now,
        sources: [],
        escalation_recommended: false,
      }
      const assistantMessage: HistoryMessage = {
        role: 'assistant',
        content: result.answer,
        created_at: now,
        sources: result.sources,
        status: result.status,
        escalation_recommended: result.escalation_recommended,
        escalation_reason: result.escalation_reason,
      }
      const updated: ConversationHistory = {
        conversation_id: result.conversation_id,
        messages: [...messages, userMessage, assistantMessage],
        total_turns: (history.data?.total_turns ?? 0) + 1,
        limit: 100,
        offset: 0,
      }
      queryClient.setQueryData(historyKey(result.conversation_id), updated)
      setPendingText(null)
      void queryClient.invalidateQueries({ queryKey: ['conversations'] })
      void queryClient.invalidateQueries({ queryKey: historyKey(result.conversation_id) })
      if (!conversationId)
        navigate(`/app/conversations/${result.conversation_id}`, { replace: true })
    } catch (error) {
      if (!mounted.current) return
      setDraft(message)
      setPendingText(null)
      if (error instanceof ApiError && error.code === 'aborted') return
      setFailure(
        error instanceof Error ? error.message : 'Something went wrong. Your draft has been kept.',
      )
      void queryClient.invalidateQueries({ queryKey: ['conversations'] })
    }
  }

  return (
    <>
      <div
        ref={viewport}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain [scrollbar-gutter:stable]"
        onScroll={(event) => {
          const element = event.currentTarget
          setFollow(element.scrollHeight - element.scrollTop - element.clientHeight < 120)
        }}
        aria-label="Conversation messages"
      >
        {loading ? (
          <div className="chat-column space-y-8 py-12" aria-label="Loading conversation">
            <Skeleton className="ml-auto h-16 w-3/5" />
            <Skeleton className="h-8 w-32" />
            <div className="space-y-3">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-5/6" />
              <Skeleton className="h-4 w-2/3" />
            </div>
          </div>
        ) : history.isError && !history.data ? (
          <div className="chat-column py-8">
            <ErrorState message={history.error.message} onRetry={() => void history.refetch()} />
          </div>
        ) : !messages.length && !pendingText ? (
          <Welcome
            onSelect={(question) => {
              setDraft(question)
              document.getElementById('message')?.focus()
            }}
          />
        ) : (
          <div className="chat-column pb-8 pt-8">
            <div className="mb-3 flex items-center gap-2 text-[10px] text-muted-foreground">
              <span className="h-px flex-1 bg-border" />
              Support conversation
              <span className="h-px flex-1 bg-border" />
            </div>
            {messages.map((message, index) => (
              <ChatMessage key={`${index}-${message.role}`} message={message} />
            ))}
            {pendingText && (
              <ChatMessage
                message={{
                  role: 'user',
                  content: pendingText,
                  sources: [],
                  escalation_recommended: false,
                }}
              />
            )}
            {busy && (
              <div role="status" aria-live="polite" className="flex items-start gap-3 py-5">
                <BrandMark className="size-8 rounded-lg" />
                <div className="pt-1">
                  <span className="text-xs font-medium">NexaDesk AI</span>
                  <p className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="size-3.5 animate-spin" />
                    {slow
                      ? 'Still working on your question. Thanks for your patience.'
                      : 'Finding a grounded answer…'}
                  </p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
      {!follow && !!messages.length && (
        <div className="pointer-events-none absolute bottom-44 left-0 right-0 flex justify-center">
          <Button
            variant="outline"
            size="sm"
            className="pointer-events-auto rounded-full shadow-md"
            onClick={() => setFollow(true)}
          >
            <ArrowDown />
            Latest messages
          </Button>
        </div>
      )}
      <div
        aria-label="Message composer"
        className="composer-dock shrink-0 border-t border-border/40 bg-background"
      >
        {failure && (
          <div className="chat-column pt-3">
            <ErrorState compact message={failure} />
            <div className="mt-2 flex justify-end gap-2">
              {conversationId && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    void history.refetch()
                    setFailure(null)
                  }}
                >
                  <RefreshCw />
                  Refresh conversation
                </Button>
              )}
              <Button variant="outline" size="sm" disabled={busy} onClick={() => void send()}>
                Retry message
              </Button>
            </div>
          </div>
        )}
        {history.isError && !!history.data && (
          <div className="chat-column pt-3">
            <ErrorState
              compact
              message="Unable to refresh this conversation. Reload its history before sending another message."
              onRetry={() => void history.refetch()}
            />
          </div>
        )}
        <Composer
          value={draft}
          onChange={setDraft}
          onSend={() => void send()}
          busy={busy}
          disabled={loading || (!!conversationId && history.isError)}
        />
      </div>
    </>
  )
}
