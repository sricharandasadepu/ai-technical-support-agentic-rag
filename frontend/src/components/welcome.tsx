import { ArrowUpRight, Clock3, Code2, FileCheck2, KeyRound, LifeBuoy, Webhook } from 'lucide-react'
import { BrandMark } from './brand'

const suggestions = [
  {
    icon: KeyRound,
    title: 'Troubleshoot a login issue',
    question: 'How do I fix NX-AUTH-4017?',
    category: 'Authentication',
  },
  {
    icon: Code2,
    title: 'Understand API throttling',
    question: 'Why am I getting HTTP 429 errors from the NexaDesk API?',
    category: 'API & integrations',
  },
  {
    icon: Webhook,
    title: 'Resolve webhook failures',
    question: 'Our webhook endpoint returns HTTP 503. What should we check?',
    category: 'Webhooks',
  },
  {
    icon: Clock3,
    title: 'Fix duplicate notifications',
    question: 'Why are users receiving duplicate ticket notifications?',
    category: 'Ticket management',
  },
]

export function Welcome({ onSelect }: { onSelect: (question: string) => void }) {
  return (
    <div className="welcome-content flex min-h-full items-center py-8 sm:py-12">
      <div className="chat-column">
        <div className="mx-auto max-w-[720px]">
          <div className="text-center">
            <BrandMark className="mx-auto mb-5 size-12 rounded-[14px]" />
            <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Your support workspace
            </p>
            <h1 className="text-[30px] font-semibold leading-[1.2] tracking-[-0.045em] sm:text-[38px]">
              A clear next step starts here.
            </h1>
            <p className="mx-auto mt-4 max-w-lg text-sm leading-7 text-muted-foreground sm:text-[15px]">
              Ask a NexaDesk question. Get practical guidance grounded in your knowledge base, with
              sources you can inspect.
            </p>
          </div>
          <div className="mb-3 mt-8 flex items-center justify-between gap-3 sm:mt-10">
            <h2 className="text-xs font-medium text-muted-foreground">
              Try a question to get started
            </h2>
            <span className="hidden text-[10px] text-muted-foreground/80 sm:inline">
              Or write your own below
            </span>
          </div>
          <div className="grid gap-2.5 min-[480px]:grid-cols-2 sm:gap-3">
            {suggestions.map(({ icon: Icon, title, question, category }) => (
              <button
                key={title}
                onClick={() => onSelect(question)}
                className="suggestion-card group flex items-center gap-3 rounded-xl border border-border bg-surface p-4 text-left transition-colors hover:border-primary/30 hover:bg-primary/3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:p-5"
              >
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-secondary text-muted-foreground transition-colors group-hover:bg-primary/8 group-hover:text-primary">
                  <Icon className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-medium">{title}</p>
                  <p className="mt-1.5 text-[11px] text-muted-foreground">{category}</p>
                </div>
                <ArrowUpRight className="size-3.5 shrink-0 text-muted-foreground/50 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-primary" />
              </button>
            ))}
          </div>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <FileCheck2 className="size-3.5" />
              Evidence-backed guidance
            </span>
            <span className="flex items-center gap-1.5">
              <LifeBuoy className="size-3.5" />
              Clear when more help is needed
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
