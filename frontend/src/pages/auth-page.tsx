import { useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  ArrowRight,
  BookOpen,
  Check,
  Eye,
  EyeOff,
  FileCheck2,
  Loader2,
  Moon,
  ShieldCheck,
  Sun,
} from 'lucide-react'
import { z } from 'zod'
import { useAuth } from '@/auth/auth-context'
import { api } from '@/lib/api'
import { loginSchema, registerSchema } from '@/lib/contracts'
import { Brand } from '@/components/brand'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ErrorState } from '@/components/error-state'
import { useTheme } from '@/theme/theme-context'

type FormValues = { name: string; email: string; password: string }

export function AuthPage({ mode }: { mode: 'login' | 'register' }) {
  const registration = mode === 'register'
  const auth = useAuth()
  const { resolvedTheme, setTheme } = useTheme()
  const navigate = useNavigate()
  const location = useLocation()
  const [visible, setVisible] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const schema = registration ? registerSchema : loginSchema.extend({ name: z.string() })
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', email: '', password: '' },
  })
  if (auth.status === 'authenticated') return <Navigate to="/app" replace />
  const accountCreated = (location.state as { registered?: boolean } | null)?.registered
  const onSubmit = async (values: FormValues) => {
    setError(null)
    try {
      if (registration) {
        await api.register(values)
        navigate('/login', { replace: true, state: { registered: true } })
      } else {
        await auth.login({ email: values.email, password: values.password })
        const from = (location.state as { from?: string } | null)?.from
        navigate(from?.startsWith('/app') ? from : '/app', { replace: true })
      }
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Unable to complete this request.')
    }
  }

  return (
    <main className="auth-layout min-h-dvh bg-surface">
      <section
        className="auth-story relative hidden overflow-hidden bg-[#161c2d] px-12 py-10 text-white lg:flex lg:flex-col xl:px-16"
        aria-label="About NexaDesk AI"
      >
        <Brand onDark className="w-[224px]" />
        <div className="relative z-10 my-auto max-w-lg py-20">
          <span className="mb-7 inline-flex items-center gap-2 rounded-full border border-white/15 px-3 py-1.5 text-xs text-indigo-200">
            <span className="size-1.5 rounded-full bg-indigo-300" />
            Your technical support workspace
          </span>
          <h1 className="text-[clamp(2.6rem,4vw,3.75rem)] font-semibold leading-[1.13] tracking-[-0.055em]">
            Less searching.
            <br />
            More clarity.
          </h1>
          <p className="mt-6 max-w-sm text-base leading-7 text-slate-300">
            Turn your NexaDesk questions into clear answers, with the evidence and next steps to
            move forward.
          </p>
          <div className="mt-12 space-y-5">
            {[
              {
                icon: BookOpen,
                title: 'Answers grounded in your knowledge base',
                text: 'Relevant documentation, brought together.',
              },
              {
                icon: FileCheck2,
                title: 'Evidence you can trace',
                text: 'Source references alongside every verified answer.',
              },
              {
                icon: ShieldCheck,
                title: 'Clear when more help is needed',
                text: 'Honest guidance when the evidence falls short.',
              },
            ].map(({ icon: Icon, title, text }) => (
              <div key={title} className="flex gap-3.5">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/5">
                  <Icon className="size-4 text-indigo-200" />
                </span>
                <div>
                  <p className="text-sm font-medium">{title}</p>
                  <p className="mt-1 text-xs text-slate-400">{text}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
        <p className="relative z-10 text-xs text-slate-400">
          Built for thoughtful technical support.
        </p>
        <div
          className="auth-grid pointer-events-none absolute -bottom-16 -right-16 size-80 opacity-15"
          aria-hidden="true"
        />
      </section>
      <section className="flex min-h-dvh flex-col px-6 py-8 sm:px-10">
        <div className="flex items-center justify-between">
          <div className="lg:invisible">
            <Brand />
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={resolvedTheme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
            onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
          >
            {resolvedTheme === 'dark' ? <Sun /> : <Moon />}
          </Button>
        </div>
        <div className="m-auto w-full max-w-[380px] py-12">
          <div className="mb-8">
            <div className="mb-6 hidden lg:block">
              <Brand />
            </div>
            <p className="mb-2 text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
              {registration ? 'Get started' : 'Welcome back'}
            </p>
            <h2 className="text-[30px] font-semibold leading-tight tracking-[-0.045em]">
              {registration ? 'Create your account' : 'Sign in to your workspace'}
            </h2>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              {registration
                ? 'A clearer path from support questions to next steps.'
                : 'Your conversations and clear next steps, all in one place.'}
            </p>
          </div>
          {accountCreated && !registration && (
            <div
              role="status"
              className="mb-5 flex gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3 text-sm text-emerald-700 dark:text-emerald-300"
            >
              <Check className="mt-0.5 size-4 shrink-0" />
              Account created. Sign in with your new credentials.
            </div>
          )}
          {auth.expired && !registration && (
            <p
              role="status"
              className="mb-5 rounded-lg bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-200"
            >
              Your session expired. Sign in again to continue.
            </p>
          )}
          {error && (
            <div className="mb-5">
              <ErrorState compact message={error} />
            </div>
          )}
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
            {registration && (
              <div>
                <label htmlFor="name" className="form-label">
                  Full name
                </label>
                <Input
                  id="name"
                  placeholder="Your name"
                  autoComplete="name"
                  aria-invalid={!!errors.name}
                  aria-describedby={errors.name ? 'name-error' : undefined}
                  {...register('name')}
                />
                {errors.name && (
                  <p id="name-error" className="form-error">
                    {errors.name.message}
                  </p>
                )}
              </div>
            )}
            <div>
              <label htmlFor="email" className="form-label">
                Email address
              </label>
              <Input
                id="email"
                type="email"
                placeholder="you@company.com"
                autoComplete="email"
                aria-invalid={!!errors.email}
                aria-describedby={errors.email ? 'email-error' : undefined}
                {...register('email')}
              />
              {errors.email && (
                <p id="email-error" className="form-error">
                  {errors.email.message}
                </p>
              )}
            </div>
            <div>
              <label htmlFor="password" className="form-label">
                Password
              </label>
              <div className="relative">
                <Input
                  id="password"
                  type={visible ? 'text' : 'password'}
                  className="pr-11"
                  placeholder={registration ? 'At least 8 characters' : 'Enter your password'}
                  autoComplete={registration ? 'new-password' : 'current-password'}
                  aria-invalid={!!errors.password}
                  aria-describedby={errors.password ? 'password-error' : undefined}
                  {...register('password')}
                />
                <button
                  type="button"
                  aria-label={visible ? 'Hide password' : 'Show password'}
                  aria-pressed={visible}
                  onClick={() => setVisible(!visible)}
                  className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-lg text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
              {errors.password && (
                <p id="password-error" className="form-error">
                  {errors.password.message}
                </p>
              )}
            </div>
            <Button type="submit" size="lg" disabled={isSubmitting} className="mt-2 w-full">
              {isSubmitting ? <Loader2 className="animate-spin" /> : null}
              {registration ? 'Create account' : 'Sign in'}
              {!isSubmitting && <ArrowRight className="ml-auto" />}
            </Button>
          </form>
          <p className="mt-7 text-center text-sm text-muted-foreground">
            {registration ? 'Already have an account? ' : 'New to NexaDesk AI? '}
            <Link
              to={registration ? '/login' : '/register'}
              className="font-medium text-primary hover:underline"
            >
              {registration ? 'Sign in' : 'Create an account'}
            </Link>
          </p>
        </div>
        <p className="text-center text-xs text-muted-foreground">
          NexaDesk AI · Technical support, with clarity.
        </p>
      </section>
    </main>
  )
}
