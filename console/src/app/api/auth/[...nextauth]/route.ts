import NextAuth, { NextAuthOptions } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import { apiClient } from '@/lib/api-client'

const USE_MOCK_API = process.env.NEXT_PUBLIC_USE_MOCK_API === 'true'

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null
        }

        try {
          // Mock authentication for demo
          if (USE_MOCK_API) {
            // Accept demo@apexmediation.com with any password, or any email with password "demo"
            if (credentials.email.includes('demo') || credentials.password === 'demo') {
              return {
                id: 'user_1',
                email: credentials.email,
                name: 'Demo Publisher',
                role: 'publisher' as const,
                publisherId: 'pub_demo_123',
                accessToken: 'mock_token_123',
              }
            }
            return null
          }

          // Call your backend API to authenticate
          const response = await apiClient.post('/auth/login', {
            email: credentials.email,
            password: credentials.password,
          })

          const { user, token } = response.data

          if (user && token) {
            return {
              id: user.id,
              email: user.email,
              name: user.name,
              role: user.role,
              publisherId: user.publisherId,
              accessToken: token,
            }
          }

          return null
        } catch (error) {
          console.error('Authentication error:', error)
          return null
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, trigger, session }) {
      // Initial login: copy user fields into token
      if (user) {
        token.accessToken = (user as any).accessToken
        token.role = (user as any).role
        token.publisherId = (user as any).publisherId
        // Track session version to allow rotation when privilege changes
        token.sessionVersion = Date.now()
        if (token.role === 'admin') {
          token.elevatedAt = Date.now()
        }
        return token
      }

      // Handle updates (e.g., role change pushed via session update)
      if (trigger === 'update' && session && (session as any).role) {
        const newRole = (session as any).role
        if (newRole !== token.role) {
          token.role = newRole
          token.sessionVersion = Date.now() // force rotation on next session fetch
          if (newRole === 'admin') token.elevatedAt = Date.now()
        }
      }
      return token
    },
    async session({ session, token }) {
      // Shorter max age for admin sessions
      const isAdmin = token.role === 'admin'
      const MAX_AGE_SECONDS = isAdmin ? 4 * 60 * 60 : 24 * 60 * 60 // 4h vs 24h
      ;(session as any).maxAge = MAX_AGE_SECONDS

      if (session.user) {
        ;(session.user as any).role = token.role
        ;(session.user as any).publisherId = (token as any).publisherId
      }
      ;(session as any).accessToken = (token as any).accessToken
      ;(session as any).sessionVersion = (token as any).sessionVersion
      ;(session as any).elevatedAt = (token as any).elevatedAt
      return session
    },
  },
  pages: {
    signIn: '/login',
    error: '/login',
  },
  session: {
    strategy: 'jwt',
    // Default session max age, admins may be shorter (see callback below)
    maxAge: 24 * 60 * 60, // 24 hours
    updateAge: 60 * 60, // refresh token every hour
  },
  cookies: {
    // Rely on NextAuth defaults but enforce secure attributes via callbacks/headers
  },
  useSecureCookies: process.env.NODE_ENV === 'production',
  secret: process.env.NEXTAUTH_SECRET || 'development-secret-change-in-production',
  events: {
    async signIn({ user }) {
      // On privilege change events (notified elsewhere), client should sign out/in.
      // Placeholder: additional logging or telemetry can be added.
    },
  },
  // cookie/session security headers are handled by Next.js/hosting; ensure Secure/HttpOnly/SameSite in production
}

const handler = NextAuth(authOptions)

export { handler as GET, handler as POST }
