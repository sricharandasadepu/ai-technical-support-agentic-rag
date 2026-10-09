import { useState } from 'react'
import { NavLink, Outlet, useNavigate, useParams } from 'react-router-dom'
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query'
import {
  BookOpen,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Loader2,
  LogOut,
  Menu,
  MessageSquare,
  Monitor,
  Moon,
  PanelLeftClose,
  Plus,
  RefreshCw,
  Search,
  Sun,
} from 'lucide-react'
import { useAuth } from '@/auth/auth-context'
import { useTheme } from '@/theme/theme-context'
import { api } from '@/lib/api'
import { cn, conversationDate, historyKey, initials } from '@/lib/utils'
import { Brand } from './brand'
import { Button } from './ui/button'
import { Skeleton } from './ui/input'
import { Tooltip } from './ui/tooltip'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from './ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui/dropdown-menu'

function ProfileMenu() {
  const { user, logout } = useAuth()
  const { theme, setTheme } = useTheme()
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="flex shrink-0 items-center gap-2.5 rounded-xl p-1.5 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Open account menu"
        >
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full border border-primary/15 bg-primary/8 text-xs font-semibold text-primary sm:size-9">
            {initials(user?.name || 'User')}
          </span>
          <span className="hidden min-w-0 xl:block">
            <span className="block max-w-36 truncate text-xs font-medium">{user?.name}</span>
            <span className="mt-0.5 block text-[10px] text-muted-foreground">Your account</span>
          </span>
          <ChevronDown className="hidden size-3 shrink-0 text-muted-foreground xl:block" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="bottom" align="end">
        <DropdownMenuLabel className="block px-2.5 py-2">
          <span className="block text-sm font-medium">{user?.name}</span>
          <span className="block text-xs font-normal text-muted-foreground">{user?.email}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="block px-2.5 py-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Appearance
        </DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={theme}
          onValueChange={(value) => {
            if (value === 'light' || value === 'dark' || value === 'system') setTheme(value)
          }}
        >
          <DropdownMenuRadioItem value="light">Light</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="dark">Dark</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="system">System</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={logout}>
          <LogOut />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function Sidebar({
  compact,
  close,
  onHelp,
}: {
  compact: boolean
  close?: () => void
  onHelp: () => void
}) {
  const [filter, setFilter] = useState('')
  const conversations = useInfiniteQuery({
    queryKey: ['conversations'],
    initialPageParam: 0,
    queryFn: ({ pageParam, signal }) => api.conversations(pageParam, signal),
    getNextPageParam: (last) =>
      last.conversations.length === last.limit && last.offset + last.limit <= 10000
        ? last.offset + last.limit
        : undefined,
  })
  const all = [
    ...new Map(
      conversations.data?.pages
        .flatMap((page) => page.conversations)
        .map((item) => [item.conversation_id, item]) ?? [],
    ).values(),
  ]
  const filtered = all.filter((item) => item.title.toLowerCase().includes(filter.toLowerCase()))
  return (
    <div className="flex h-full flex-col">
      <div className={cn('flex h-[72px] items-center px-6', compact && 'justify-center px-0')}>
        <NavLink to="/app" onClick={close} aria-label="NexaDesk AI home">
          <Brand compact={compact} />
        </NavLink>
      </div>
      <div className={cn('px-4 pt-2', compact && 'px-3')}>
        <Tooltip text="New conversation">
          <Button
            asChild
            variant="outline"
            className={cn(
              'w-full justify-start border-primary/20 bg-primary/5 text-primary shadow-none hover:bg-primary/10 hover:text-primary',
              compact && 'justify-center px-0',
            )}
          >
            <NavLink to="/app" onClick={close} aria-label="New conversation">
              <Plus />
              {!compact && 'New conversation'}
            </NavLink>
          </Button>
        </Tooltip>
      </div>
      {!compact && (
        <div className="relative mx-4 mb-3 mt-5">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
          <input
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            aria-label="Search loaded conversations"
            placeholder="Search conversations"
            className="h-9 w-full rounded-lg border border-transparent bg-secondary/70 pl-8 pr-3 text-xs placeholder:text-muted-foreground focus:border-border focus:bg-surface focus:outline-none focus:ring-2 focus:ring-ring/20"
          />
        </div>
      )}
      <div
        className={cn(
          'mb-2 flex items-center justify-between px-6',
          compact && 'justify-center px-0 pt-6',
        )}
      >
        <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          {compact ? (
            <MessageSquare className="size-3.5" aria-label="Recent conversations" />
          ) : (
            'Recent conversations'
          )}
        </span>
        {!compact && (
          <Tooltip text="Refresh conversations">
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Refresh conversations"
              disabled={conversations.isFetching}
              onClick={() => void conversations.refetch()}
            >
              <RefreshCw className={cn('!size-3.5', conversations.isFetching && 'animate-spin')} />
            </Button>
          </Tooltip>
        )}
      </div>
      <nav
        aria-label="Conversation history"
        className={cn('flex-1 overflow-y-auto px-3 pb-5', compact && 'px-2')}
      >
        {conversations.isPending && (
          <div aria-label="Loading conversations" className="space-y-3 px-2 pt-2">
            {[0, 1, 2, 3].map((item) => (
              <Skeleton key={item} className={cn('h-10 w-full', compact && 'size-8')} />
            ))}
          </div>
        )}
        {conversations.isError && (
          <div role="alert" className="px-2 py-3 text-xs leading-5 text-muted-foreground">
            {!compact && <p>Couldn’t load conversations.</p>}
            <Button
              variant="ghost"
              size="sm"
              className="mt-1"
              onClick={() => void conversations.refetch()}
              aria-label="Retry loading conversations"
            >
              <RefreshCw />
              {!compact && 'Retry'}
            </Button>
          </div>
        )}
        {!conversations.isPending && !conversations.isError && !filtered.length && !compact && (
          <div className="px-3 py-8 text-center">
            <MessageSquare className="mx-auto mb-3 size-5 text-muted-foreground/60" />
            <p className="text-xs font-medium">
              {filter ? 'No matching conversations' : 'A fresh start'}
            </p>
            <p className="mt-1.5 text-xs leading-5 text-muted-foreground">
              {filter
                ? 'Search applies to conversations loaded here.'
                : 'Your conversations will appear here.'}
            </p>
          </div>
        )}
        {filtered.map((item) => (
          <Tooltip key={item.conversation_id} text={item.title}>
            <NavLink
              to={`/app/conversations/${item.conversation_id}`}
              onClick={close}
              className={({ isActive }) =>
                cn(
                  'group mb-1 flex min-h-11 items-center gap-2.5 rounded-lg px-3 py-2.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground',
                  isActive && 'bg-primary/7 text-primary dark:bg-primary/12',
                  compact && 'justify-center px-0',
                )
              }
              aria-label={item.title}
            >
              <MessageSquare className="size-3.5 shrink-0" />
              {!compact && (
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] leading-5">{item.title}</span>
                  <span className="mt-0.5 block text-[10px] text-muted-foreground">
                    {conversationDate(item.updated_at)} · {item.turn_count}{' '}
                    {item.turn_count === 1 ? 'reply' : 'replies'}
                  </span>
                </span>
              )}
            </NavLink>
          </Tooltip>
        ))}
        {conversations.hasNextPage && (
          <Button
            variant="ghost"
            size="sm"
            className="mt-3 w-full"
            disabled={conversations.isFetchingNextPage}
            onClick={() => void conversations.fetchNextPage()}
            aria-label="Load more conversations"
          >
            {conversations.isFetchingNextPage ? (
              <Loader2 className="animate-spin" />
            ) : (
              <ChevronDown />
            )}
            {!compact && 'Load more'}
          </Button>
        )}
      </nav>
      <div className={cn('border-t border-border/70 px-4 pb-4 pt-3', compact && 'px-2')}>
        <Button
          variant="ghost"
          className={cn('w-full justify-start text-xs', compact && 'justify-center px-0')}
          aria-label="Support guide"
          onClick={onHelp}
        >
          <CircleHelp />
          {!compact && 'Support guide'}
        </Button>
        {!compact && (
          <p className="px-3 pt-2 text-[10px] leading-5 text-muted-foreground">
            Answers grounded in the NexaDesk knowledge base.
          </p>
        )}
      </div>
    </div>
  )
}

export function AppShell() {
  const [compact, setCompact] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const { resolvedTheme, setTheme } = useTheme()
  const { conversationId } = useParams()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  return (
    <div className="flex h-dvh overflow-hidden bg-background">
      <a href="#main-content" className="skip-link">
        Skip to conversation
      </a>
      <aside
        className={cn(
          'hidden shrink-0 border-r border-border/80 bg-sidebar transition-[width] duration-150 md:block',
          compact ? 'w-[76px]' : 'w-[272px]',
        )}
        aria-label="Workspace navigation"
      >
        <Sidebar compact={compact} onHelp={() => setHelpOpen(true)} />
      </aside>
      <Dialog open={mobileOpen} onOpenChange={setMobileOpen}>
        <DialogContent drawer className="w-[272px] border-0 bg-sidebar p-0">
          <DialogTitle className="sr-only">Workspace navigation</DialogTitle>
          <DialogDescription className="sr-only">
            Start a new conversation or open your support history.
          </DialogDescription>
          <Sidebar
            compact={false}
            close={() => setMobileOpen(false)}
            onHelp={() => {
              setMobileOpen(false)
              setHelpOpen(true)
            }}
          />
        </DialogContent>
      </Dialog>
      <div className="flex min-w-0 flex-1 flex-col">
        <header
          aria-label="Workspace header"
          className="flex h-[72px] shrink-0 items-center gap-2 border-b border-border/70 bg-surface px-3 sm:gap-3 sm:px-6 lg:px-8"
        >
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            aria-label="Open navigation"
            aria-expanded={mobileOpen}
            onClick={() => setMobileOpen(true)}
          >
            <Menu />
          </Button>
          <Tooltip text={compact ? 'Expand sidebar' : 'Collapse sidebar'}>
            <Button
              variant="ghost"
              size="icon-sm"
              className="hidden md:inline-flex"
              aria-label={compact ? 'Expand sidebar' : 'Collapse sidebar'}
              aria-expanded={!compact}
              onClick={() => setCompact(!compact)}
            >
              {compact ? <ChevronRight /> : <PanelLeftClose />}
            </Button>
          </Tooltip>
          <div className="min-w-0">
            <NavLink
              to="/app"
              aria-label="NexaDesk AI workspace"
              className="inline-flex rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Brand compact className="sm:hidden" />
              <Brand className="hidden w-[164px] sm:inline-flex" />
            </NavLink>
          </div>
          <span className="ml-1 hidden border-l border-border pl-4 text-xs text-muted-foreground lg:block">
            Support assistant
          </span>
          <nav
            aria-label="Workspace controls"
            className="ml-auto flex shrink-0 items-center gap-0.5 sm:gap-1"
          >
            {conversationId && (
              <Tooltip text="Refresh this conversation">
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Refresh this conversation"
                  onClick={() => {
                    void queryClient.invalidateQueries({ queryKey: historyKey(conversationId) })
                    void queryClient.invalidateQueries({ queryKey: ['conversations'] })
                  }}
                >
                  <RefreshCw />
                </Button>
              </Tooltip>
            )}
            <Tooltip text="Start a new conversation">
              <Button
                variant="ghost"
                size="icon"
                className="hidden sm:inline-flex"
                aria-label="Start a new conversation"
                onClick={() => navigate('/app')}
              >
                <Plus />
              </Button>
            </Tooltip>
            <Tooltip
              text={resolvedTheme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
            >
              <Button
                variant="ghost"
                size="icon"
                aria-label={
                  resolvedTheme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'
                }
                onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
              >
                {resolvedTheme === 'dark' ? <Sun /> : <Moon />}
              </Button>
            </Tooltip>
            <span className="mx-1 hidden h-6 w-px bg-border sm:block" />
            <ProfileMenu />
          </nav>
        </header>
        <main
          id="main-content"
          className="relative flex min-h-0 flex-1 flex-col focus:outline-none"
          tabIndex={-1}
        >
          <Outlet />
        </main>
      </div>
      <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
        <DialogContent>
          <span className="mb-4 flex size-11 items-center justify-center rounded-xl bg-primary/8 text-primary">
            <BookOpen className="size-5" />
          </span>
          <DialogTitle className="text-xl font-semibold tracking-tight">
            A clearer support conversation
          </DialogTitle>
          <DialogDescription className="mt-2 text-sm leading-6 text-muted-foreground">
            NexaDesk AI helps you find answers in the NexaDesk knowledge base.
          </DialogDescription>
          <div className="mt-6 space-y-5">
            {[
              {
                icon: MessageSquare,
                title: 'Start with the details',
                text: 'Describe what happened, what you expected, and any error message or product version.',
              },
              {
                icon: BookOpen,
                title: 'Inspect the evidence',
                text: 'Select a source number to see the document reference and ticket ID, when available.',
              },
              {
                icon: Monitor,
                title: 'Keep the conversation going',
                text: 'Open a previous conversation to continue. If evidence is insufficient, the assistant will recommend a support follow-up.',
              },
            ].map(({ icon: Icon, title, text }) => (
              <div key={title} className="flex gap-3">
                <Icon className="mt-1 size-4 shrink-0 text-primary" />
                <div>
                  <p className="text-sm font-medium">{title}</p>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">{text}</p>
                </div>
              </div>
            ))}
          </div>
          <p className="mt-6 border-t border-border pt-4 text-xs leading-5 text-muted-foreground">
            Recommendations are grounded in available documentation. Always verify that the
            suggested steps resolve your issue.
          </p>
        </DialogContent>
      </Dialog>
    </div>
  )
}
