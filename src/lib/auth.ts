import NextAuth, { AuthOptions } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'

const users = new Map<string, { id: string; email: string; passwordHash: string; role: string }>()

users.set('mohameddosho20@gmail.com', {
  id: 'demo-user-1',
  email: 'mohameddosho20@gmail.com',
  passwordHash: '5e884898da28047151d0e56f8dc6292773603d0d6aabbdd62a11ef721d1542d8',
  role: 'user'
})

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
        
        const user = users.get(credentials.email)
        if (!user) return null
        
        const passwordHash = hashPassword(credentials.password)
        if (passwordHash !== user.passwordHash) return null
        
        return {
          id: user.id,
          email: user.email,
        }
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