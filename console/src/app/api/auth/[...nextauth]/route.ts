import NextAuth, { NextAuthOptions } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import { apiClient } from '@/lib/api-client'

const USE_MOCK_API = process.env.NEXT_PUBLIC_USE_MOCK_API === 'true'

const authOptions: NextAuthOptions = {
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
    async jwt({ token, user }) {
      if (user) {
        token.accessToken = user.accessToken
        token.role = user.role
        token.publisherId = user.publisherId
      }
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.role = token.role
        session.user.publisherId = token.publisherId
      }
      if (session) {
        session.accessToken = token.accessToken
      }
      return session
    },
  },
  pages: {
    signIn: '/login',
    error: '/login',
  },
  session: {
    strategy: 'jwt',
    maxAge: 24 * 60 * 60, // 24 hours
  },
  secret: process.env.NEXTAUTH_SECRET || 'development-secret-change-in-production',
}

const handler = NextAuth(authOptions)

export { handler as GET, handler as POST }
