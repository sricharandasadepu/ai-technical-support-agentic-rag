import { AlertCircle, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export function ErrorState({
  message,
  onRetry,
  compact = false,
}: {
  message: string
  onRetry?: () => void
  compact?: boolean
}) {
  return (
    <div
      role="alert"
      className={cn(
        'rounded-xl border border-destructive/15 bg-destructive/5 text-sm',
        compact ? 'p-3' : 'mx-auto max-w-md p-6',
      )}
    >
      <div className="flex gap-2.5">
        <AlertCircle className="mt-0.5 size-4 shrink-0 text-destructive" />
        <p className="leading-relaxed">{message}</p>
      </div>
      {onRetry && (
        <Button variant="outline" size="sm" className="mt-3" onClick={onRetry}>
          <RefreshCw />
          Try again
        </Button>
      )}
    </div>
  )
}
