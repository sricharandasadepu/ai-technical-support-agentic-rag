import { useEffect, useRef } from 'react'
import { ArrowUp, Loader2 } from 'lucide-react'
import { Button } from './ui/button'
import { Tooltip } from './ui/tooltip'
import { cn } from '@/lib/utils'

export function Composer({
  value,
  onChange,
  onSend,
  busy,
  disabled,
}: {
  value: string
  onChange: (value: string) => void
  onSend: () => void
  busy: boolean
  disabled?: boolean
}) {
  const ref = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    const input = ref.current
    if (input) {
      input.style.height = '0px'
      input.style.height = `${Math.min(input.scrollHeight || 48, 160)}px`
    }
  }, [value])
  const invalid = value.trim().length > 4000
  return (
    <div className="chat-column pb-4 pt-3 sm:pb-5">
      <form
        onSubmit={(event) => {
          event.preventDefault()
          if (!busy && !disabled && value.trim() && !invalid) onSend()
        }}
        className={cn(
          'composer rounded-2xl border border-border bg-surface p-3 shadow-[0_3px_20px_-8px_rgba(15,23,42,0.15)] transition-shadow focus-within:border-primary/35 focus-within:ring-3 focus-within:ring-primary/5',
          invalid && 'border-destructive',
        )}
      >
        <label htmlFor="message" className="sr-only">
          Your NexaDesk question
        </label>
        <textarea
          ref={ref}
          id="message"
          rows={1}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="Describe your NexaDesk issue…"
          aria-describedby="composer-hint"
          aria-invalid={invalid}
          disabled={busy || disabled}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault()
              if (!busy && !disabled && value.trim() && !invalid) onSend()
            }
          }}
          className="block max-h-40 min-h-12 w-full resize-none bg-transparent px-1 py-2 text-[14px] leading-6 outline-none placeholder:text-muted-foreground/75 disabled:opacity-60"
        />
        <div className="mt-1 flex items-center justify-between gap-3">
          <span
            id="composer-hint"
            className={cn('pl-1 text-[10px] text-muted-foreground', invalid && 'text-destructive')}
          >
            {invalid ? (
              'Please keep your message under 4,000 characters.'
            ) : (
              <>
                <span className="hidden sm:inline">Shift + Enter for a new line</span>
                <span className="sm:hidden">Ask a technical support question</span>
              </>
            )}
          </span>
          <Tooltip text={busy ? 'Waiting for a response' : 'Send message'}>
            <Button
              type="submit"
              size="icon"
              className="size-8 rounded-lg"
              disabled={busy || disabled || !value.trim() || invalid}
              aria-label="Send message"
            >
              {busy ? <Loader2 className="animate-spin" /> : <ArrowUp className="!size-[18px]" />}
            </Button>
          </Tooltip>
        </div>
      </form>
      <p className="mt-2.5 text-center text-[10px] leading-4 text-muted-foreground">
        NexaDesk AI uses available knowledge. Verify recommendations before applying them.
      </p>
    </div>
  )
}
