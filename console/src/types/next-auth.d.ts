import 'next-auth'
import 'next-auth/jwt'

declare module 'next-auth' {
  interface User {
    id: string
    email: string
    name: string
    role: 'publisher' | 'admin'
    publisherId: string
    accessToken: string
  }

  interface Session {
    user: {
      id: string
      email: string
      name: string
      role: 'publisher' | 'admin'
      publisherId: string
    }
    accessToken: string
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    accessToken: string
    role: 'publisher' | 'admin'
    publisherId: string
  }
}
