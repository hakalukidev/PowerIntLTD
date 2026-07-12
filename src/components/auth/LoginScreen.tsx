"use client"

import { useEffect, useState } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { ArrowRight, LockKeyhole, Smartphone, Users } from 'lucide-react'

import { ThemeToggle } from '@/components/theme-toggle'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useERP } from '@/lib/erp/provider'

export function LoginScreen() {
  const router = useRouter()
  const { currentUser, loading, login } = useERP()
  const [identifier, setIdentifier] = useState('01844902338')
  const [password, setPassword] = useState('123456')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (currentUser) {
      router.replace('/admin/dashboard')
    }
  }, [currentUser, router])

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitting(true)
    setError(null)

    try {
      await login(identifier, password)
      router.replace('/admin/dashboard')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to log in.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-background">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_20%,hsl(var(--primary)/0.16),transparent_45%),radial-gradient(circle_at_85%_80%,hsl(var(--primary)/0.12),transparent_45%)]" />

      <div className="relative flex min-h-screen flex-col">
        <header className="flex items-center justify-between px-6 py-6 sm:px-10">
          <div className="flex items-center gap-3">
            <Image src="/muaz_icon.png" alt="Muaz Technology" width={30} height={30} className="h-7 w-7 rounded-md object-contain" />
            <div className="flex flex-col leading-tight">
              <span className="text-sm font-semibold uppercase tracking-[0.3em] text-muted-foreground">Muaz Technology</span>
              <span className="text-[11px] font-medium uppercase tracking-[0.25em] text-primary/70">ERP System</span>
            </div>
          </div>
          <ThemeToggle />
        </header>

        <div className="mx-auto grid w-full max-w-6xl flex-1 items-center gap-16 px-6 pb-16 lg:grid-cols-2 lg:gap-24 lg:px-10">
          <section className="hidden space-y-10 lg:block">
            <div className="space-y-5">
              <span className="inline-flex items-center rounded-full border border-primary/30 bg-primary/5 px-3 py-1 text-xs font-medium text-primary">
                Cloud-ready, role-based access
              </span>
              <h1 className="max-w-lg text-5xl font-semibold leading-[1.1] tracking-tight text-foreground">
                Simple ERP control for inventory, sales, and finance, everywhere.
              </h1>
              <p className="max-w-md text-base leading-7 text-muted-foreground">
                Log in once, then manage dashboards, stock, sales, reports, and user access from the same realtime workspace.
              </p>
            </div>

            <div className=" px-5 py-4 text-sm leading-6 text-muted-foreground shadow-b-sm backdrop-blur">
              <p className="font-medium text-foreground">
                ©{' '}
                <a href="https://hakaluki.dev" target="_blank" rel="noopener noreferrer" className="hover:text-primary hover:underline">
                  hakaluki.dev
                </a>
              </p>
              <p className="mt-1">
                Developed by{' '}
                <a href="https://hakaluki.dev" target="_blank" rel="noopener noreferrer" className="hover:text-primary hover:underline">
                  hakaluki.dev
                </a>
              </p>
            </div>
          </section>

          <section className="mx-auto w-full max-w-sm">
            <div className="space-y-2">
              <h2 className="text-3xl font-semibold tracking-tight text-foreground">Sign in</h2>
              <p className="text-sm text-muted-foreground">Use your phone number or login ID with the password set by admin.</p>
            </div>

            <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Login ID or phone</label>
                <Input
                  value={identifier}
                  onChange={(event) => setIdentifier(event.target.value)}
                  placeholder="01844902338"
                  autoComplete="username"
                  className="h-11 rounded-xl"
                  required
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Password</label>
                <Input
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  type="password"
                  placeholder="Password"
                  autoComplete="current-password"
                  className="h-11 rounded-xl"
                  required
                />
              </div>

              {error ? <p className="text-sm text-rose-600 dark:text-rose-400">{error}</p> : null}

              <Button type="submit" className="h-11 w-full rounded-xl text-sm font-medium" disabled={submitting || loading}>
                {submitting ? 'Signing in...' : loading ? 'Loading users...' : (
                  <span className="flex items-center justify-center gap-2">
                    Enter dashboard <ArrowRight className="h-4 w-4" />
                  </span>
                )}
              </Button>
            </form>

            <div className="mt-8 border-t border-border/60 pt-6 text-sm leading-6 text-muted-foreground">
              <p className="font-medium text-foreground">Demo admin account</p>
              <p className="mt-1">Phone: 01844902338</p>
              <p>Password: 123456</p>
            </div>
          </section>
        </div>

        <footer className="border-t border-border/60 px-6 py-4 text-center text-xs font-medium uppercase tracking-[0.22em] text-muted-foreground sm:px-10 lg:hidden">
          ©{' '}
          <a href="https://hakaluki.dev" target="_blank" rel="noopener noreferrer" className="hover:text-primary hover:underline">
            hakaluki.dev
          </a>
          {' '}· Developed by{' '}
          <a href="https://hakaluki.dev" target="_blank" rel="noopener noreferrer" className="hover:text-primary hover:underline">
            hakaluki.dev
          </a>
        </footer>
      </div>
    </main>
  )
}
