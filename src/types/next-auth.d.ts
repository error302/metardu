import 'next-auth'

declare module 'next-auth' {
  /** Returned by `authorize()` and stored in the JWT */
  interface User {
    id: string
    email: string
    name?: string | null
    image?: string | null
    isk_number?: string
    verified_isk?: boolean
    role?: string
    provider?: string
  }

  interface Session {
    user: {
      id: string
      email?: string | null
      name?: string | null
      image?: string | null
      isk_number?: string
      verified_isk?: boolean
      role?: string
      provider?: string
    }
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id: string
    isk_number?: string
    verified_isk?: boolean
    role?: string
    provider?: string
  }
}
