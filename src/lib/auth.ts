import NextAuth, { AuthOptions } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'

function hashPassword(password: string): string {
  const crypto = require('crypto')
  return crypto.createHash('sha256').update(password).digest('hex')
}

export const authOptions: AuthOptions = {
  providers: [
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null
        
        // Demo users - in production, check against database
        const demoUsers: Record<string, { id: string; name: string; passwordHash: string }> = {
          'mohameddosho20@gmail.com': {
            id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
            name: 'Mohamed Dosho',
            passwordHash: '5e884898da28047151d0e56f8dc6292773603d0d6aabbdd62a11ef721d1542d8' // password
          }
        }
        
        const user = demoUsers[credentials.email]
        if (!user) return null
        
        // Accept 'password' as the demo password
        if (credentials.password === 'password') {
          return {
            id: user.id,
            email: credentials.email,
            name: user.name,
          }
        }
        
        return null
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id
      }
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        // @ts-ignore - NextAuth session type extension
        session.user.id = token.id
      }
      return session
    },
  },
  pages: {
    signIn: '/login',
  },
  session: {
    strategy: 'jwt',
  },
  secret: process.env.AUTH_SECRET || 'development-secret-key-change-in-production',
}