'use client'

import { useEffect, useState } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { Shield } from 'lucide-react'

const MAX_ATTEMPTS_BEFORE_COOLDOWN = 5
const COOLDOWN_MS = 30_000
const DEMO_LOGIN_ENABLED = process.env.NEXT_PUBLIC_DEMO_LOGIN === 'true'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState(() => (DEMO_LOGIN_ENABLED ? 'demo@apexmediation.com' : ''))
  const [password, setPassword] = useState(() => (DEMO_LOGIN_ENABLED ? 'demo' : ''))
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [csrfToken, setCsrfToken] = useState<string | null>(null)
  const [csrfError, setCsrfError] = useState('')
  const [failedAttempts, setFailedAttempts] = useState(0)
  const [cooldownUntil, setCooldownUntil] = useState<number | null>(null)
  const [humanCheck, setHumanCheck] = useState(false)
  const [cooldownRemaining, setCooldownRemaining] = useState(0)

  useEffect(() => {
    if (!cooldownUntil) return
    const updateRemaining = () => {
      const seconds = Math.max(0, Math.ceil((cooldownUntil - Date.now()) / 1000))
      setCooldownRemaining(seconds)
      if (seconds <= 0) {
        setCooldownUntil(null)
      }
    }
    updateRemaining()
    const interval = setInterval(updateRemaining, 1000)
    return () => clearInterval(interval)
  }, [cooldownUntil])

  useEffect(() => {
    if (!cooldownUntil) {
      setCooldownRemaining(0)
    }
  }, [cooldownUntil])

  useEffect(() => {
    const controller = new AbortController()

    const fetchCsrf = async () => {
      try {
        const response = await fetch('/api/auth/csrf', { signal: controller.signal })
        if (!response.ok) throw new Error('Failed to fetch CSRF token')
        const data = await response.json()
        setCsrfToken(data?.csrfToken || data?.token || null)
      } catch (err) {
        if ((err as Error).name === 'AbortError') return
        setCsrfError('Unable to secure login form. Refresh or contact support if this persists.')
      }
    }

    fetchCsrf()

    return () => controller.abort()
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (cooldownRemaining > 0) {
      setError('Login temporarily locked after repeated attempts. Please wait and try again.')
      return
    }
    if (!csrfToken) {
      setCsrfError('CSRF token missing. Please refresh before submitting.')
      return
    }
    if (!humanCheck && failedAttempts >= 2) {
      setError('Please confirm you are not a bot before continuing.')
      return
    }

    setIsLoading(true)
    setError('')

    try {
      const result = await signIn('credentials', {
        email,
        password,
        csrfToken,
        redirect: false,
      })

      if (result?.error) {
        setError('Invalid credentials. Please try again.')
        setFailedAttempts((prev) => {
          const next = prev + 1
          if (next >= MAX_ATTEMPTS_BEFORE_COOLDOWN) {
            setCooldownUntil(Date.now() + COOLDOWN_MS)
            return 0
          }
          return next
        })
      } else if (result?.ok) {
        setFailedAttempts(0)
        setHumanCheck(false)
        router.push('/dashboard')
        router.refresh()
      } else {
        setError('An unexpected error occurred.')
      }
    } catch (err) {
      setError('An error occurred. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-50 via-white to-accent-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo/Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center h-16 w-16 rounded-2xl bg-primary-600 text-white mb-4">
            <Shield className="h-8 w-8" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">ApexMediation</h1>
          <p className="text-gray-600">Sign in to your publisher console</p>
        </div>

        {/* Login Card */}
        <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-8">
          <form onSubmit={handleSubmit} className="space-y-6" autoComplete="on" noValidate>
            {error && (
              <div className="p-4 bg-danger-50 border border-danger-200 text-danger-700 rounded-lg text-sm" role="alert" aria-live="assertive">
                {error}
              </div>
            )}

            {csrfError && (
              <div className="p-4 bg-warning-50 border border-warning-200 text-warning-800 rounded-lg text-sm" role="alert">
                {csrfError}
              </div>
            )}

            {/* Demo Notice */}
            {DEMO_LOGIN_ENABLED && (
              <div className="p-4 bg-blue-50 border border-blue-200 text-blue-700 rounded-lg text-sm">
                <p className="font-medium mb-1">Demo Mode</p>
                <p>
                  Use <strong>demo@apexmediation.com</strong> with any password to login in sandbox
                  environments.
                </p>
              </div>
            )}

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                Email
              </label>
              <input
                id="email"
                type="email"
                name="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input w-full"
                placeholder="you@example.com"
                required
                autoComplete="email"
                inputMode="email"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
                Password
              </label>
              <input
                id="password"
                type="password"
                name="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input w-full"
                placeholder="Enter your password"
                required
                autoComplete="current-password"
                spellCheck={false}
              />
            </div>

            {failedAttempts >= 2 && (
              <div className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2">
                <input
                  id="human-check"
                  type="checkbox"
                  checked={humanCheck}
                  onChange={(event) => setHumanCheck(event.target.checked)}
                  className="h-4 w-4"
                  required
                />
                <label htmlFor="human-check" className="text-sm text-gray-700">
                  I&apos;m not a bot
                </label>
              </div>
            )}

            {cooldownRemaining > 0 && (
              <p className="text-sm text-warning-700 bg-warning-50 border border-warning-200 rounded-lg p-3">
                Too many attempts. Please wait {cooldownRemaining} seconds before trying again.
              </p>
            )}

            <button
              type="submit"
              disabled={
                isLoading || cooldownRemaining > 0 || !!csrfError || !csrfToken || (failedAttempts >= 2 && !humanCheck)
              }
              className="btn-primary w-full disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>

          <div className="mt-6 text-center text-sm text-gray-600">
            <p>
              Don&apos;t have an account?{' '}
              <a
                href="mailto:sales@apexmediation.com"
                className="text-primary-600 hover:text-primary-700 font-medium"
              >
                Contact sales
              </a>
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="text-center mt-8 text-sm text-gray-600">
          <p>© 2025 ApexMediation. All rights reserved.</p>
          <p className="mt-1" aria-live="polite">
            {cooldownRemaining > 0
              ? `Login locked for ${cooldownRemaining}s due to repeated failures.`
              : `${Math.max(0, MAX_ATTEMPTS_BEFORE_COOLDOWN - failedAttempts)} attempts remaining before a short lockout.`}
          </p>
        </div>
      </div>
    </div>
  )
}
