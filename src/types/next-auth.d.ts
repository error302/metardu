import 'next-auth'

declare module 'next-auth' {
  /** Returned by `authorize()` and stored in the JWT */
  interface User {
    id: string
    email: string
    name?: string | null
    isk_number?: string
    verified_isk?: boolean
  }

  interface Session {
    user: {
      id: string
      email?: string | null
      name?: string | null
      image?: string | null
      isk_number?: string
      verified_isk?: boolean
    }
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id: string
    isk_number?: string
    verified_isk?: boolean
  }
}

