import { BrowserRouter, Link, Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { lazy, Suspense } from 'react'
import { useAuth } from '@/auth/auth-context'
import { AppShell } from '@/components/app-shell'
import { AuthPage } from '@/pages/auth-page'
import { Brand } from '@/components/brand'
import { ErrorState } from '@/components/error-state'
import { Button } from '@/components/ui/button'

const ChatPage = lazy(() =>
  import('@/pages/chat-page').then((module) => ({ default: module.ChatPage })),
)
function PageLoading() {
  return (
    <div
      role="status"
      className="flex flex-1 items-center justify-center gap-2 p-8 text-sm text-muted-foreground"
    >
      <Loader2 className="size-4 animate-spin" />
      Opening conversation…
    </div>
  )
}

export function ProtectedRoute() {
  const auth = useAuth()
  const location = useLocation()
  if (auth.status === 'loading')
    return (
      <div
        role="status"
        className="flex min-h-dvh items-center justify-center gap-3 bg-background text-sm text-muted-foreground"
      >
        <Loader2 className="size-4 animate-spin" />
        Opening your workspace…
      </div>
    )
  if (auth.status === 'unavailable')
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-8 bg-background p-6">
        <Brand />
        <ErrorState message={auth.error || 'Unable to verify your session.'} onRetry={auth.retry} />
        <Button variant="ghost" onClick={auth.logout}>
          Return to sign in
        </Button>
      </div>
    )
  if (auth.status !== 'authenticated')
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  return <Outlet />
}

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/app" replace />} />
      <Route path="/login" element={<AuthPage key="login" mode="login" />} />
      <Route path="/register" element={<AuthPage key="register" mode="register" />} />
      <Route element={<ProtectedRoute />}>
        <Route path="/app" element={<AppShell />}>
          <Route
            index
            element={
              <Suspense fallback={<PageLoading />}>
                <ChatPage />
              </Suspense>
            }
          />
          <Route
            path="conversations/:conversationId"
            element={
              <Suspense fallback={<PageLoading />}>
                <ChatPage />
              </Suspense>
            }
          />
        </Route>
      </Route>
      <Route
        path="*"
        element={
          <div className="flex min-h-dvh flex-col items-center justify-center gap-5 bg-background p-6">
            <Brand />
            <h1 className="text-2xl font-semibold">This page isn’t here.</h1>
            <p className="text-sm text-muted-foreground">
              Return to your support workspace to continue.
            </p>
            <Button asChild>
              <Link to="/app">Open workspace</Link>
            </Button>
          </div>
        }
      />
    </Routes>
  )
}
export function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  )
}
