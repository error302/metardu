import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { isAdmin } from '@/lib/auth/session'

export const dynamic = 'force-dynamic'

/**
 * GET /api/subscription/project-count
 *
 * Returns the user's project count for subscription limit checks.
 * Admins get a count of all projects (since they can see everything).
 */
export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ count: 0 }, { status: 401 })
    }

    const userId = session.user.id
    const userIsAdmin = await isAdmin()

    let count: number
    if (userIsAdmin) {
      const { rows } = await db.query('SELECT COUNT(*) as count FROM projects')
      count = parseInt(rows[0]?.count || '0', 10)
    } else {
      const { rows } = await db.query('SELECT COUNT(*) as count FROM projects WHERE user_id = $1', [userId])
      count = parseInt(rows[0]?.count || '0', 10)
    }

    return NextResponse.json({ count })
  } catch (error) {
    console.error('[/api/subscription/project-count] Error:', error)
    return NextResponse.json({ count: 0 }, { status: 500 })
  }
}
