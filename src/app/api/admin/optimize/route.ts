/**
 * Admin API for Performance Optimization
 * Apply database indexes and clear caches
 */

import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth/session'
import { recommendedIndexes } from '@/lib/db/optimization'
import redisCache from '@/lib/cache/redis'
import { createClient } from '@/lib/api-client/server'

export async function POST(request: NextRequest) {
  try {
    // Check authentication
    const user = await getAuthUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check admin role
    const dbClient = await createClient()
    const { data: profile } = await dbClient
      .from('profiles')
      .select('role')
      .eq('user_id', user.id)
      .single()

    if (profile?.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { action } = await request.json()

    switch (action) {
      case 'apply_indexes':
        return applyIndexes(dbClient)
      
      case 'clear_cache':
        return clearCaches()
      
      case 'analyze_queries':
        return analyzeQueries()
      
      case 'full_optimization':
        return runFullOptimization(dbClient)
      
      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    }
  } catch (error) {
    console.error('[Admin Optimize] Error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

async function applyIndexes(dbClient: any): Promise<NextResponse> {
  const results: { table: string; index: string; status: string; error?: string }[] = []

  for (const [table, indexes] of Object.entries(recommendedIndexes)) {
    for (const sql of indexes as string[]) {
      try {
        // Use RPC to execute raw SQL (requires proper setup)
        const { error } = await dbClient.rpc('execute_sql', { sql })
        
        if (error) {
          results.push({ table, index: sql, status: 'failed', error: error.message })
        } else {
          results.push({ table, index: sql, status: 'success' })
        }
      } catch (error: any) {
        results.push({ table, index: sql, status: 'failed', error: error.message })
      }
    }
  }

  const successCount = results.filter(r => r.status === 'success').length
  const failedCount = results.filter(r => r.status === 'failed').length

  return NextResponse.json({
    action: 'apply_indexes',
    summary: { total: results.length, success: successCount, failed: failedCount },
    results,
  })
}

async function clearCaches(): Promise<NextResponse> {
  // Connect to Redis
  await redisCache.connect()
  
  // Clear all application caches
  await redisCache.delPattern('project:*')
  await redisCache.delPattern('projects:list:*')
  await redisCache.delPattern('survey_points:*')
  await redisCache.delPattern('submissions:*')
  await redisCache.delPattern('api:*')
  await redisCache.delPattern('count:*')

  return NextResponse.json({
    action: 'clear_cache',
    status: 'success',
    message: 'All application caches cleared',
  })
}

async function analyzeQueries(): Promise<NextResponse> {
  // This would integrate with PostgreSQL slow query log
  // For now, return a placeholder
  return NextResponse.json({
    action: 'analyze_queries',
    status: 'success',
    message: 'Query analysis requires PostgreSQL slow query log access',
    recommendations: [
      'Enable pg_stat_statements extension',
      'Set log_min_duration_statement = 500',
      'Monitor pg_stat_statements for slow queries',
    ],
  })
}

async function runFullOptimization(dbClient: any): Promise<NextResponse> {
  const results: Record<string, any> = {}

  // 1. Apply indexes
  const indexResult = await applyIndexes(dbClient)
  results.indexes = await indexResult.json()

  // 2. Clear caches
  const cacheResult = await clearCaches()
  results.cache = await cacheResult.json()

  // 3. Analyze queries
  const queryResult = await analyzeQueries()
  results.queries = await queryResult.json()

  return NextResponse.json({
    action: 'full_optimization',
    status: 'success',
    timestamp: new Date().toISOString(),
    results,
  })
}

// GET endpoint for status
export async function GET() {
  return NextResponse.json({
    status: 'available',
    endpoints: [
      { method: 'POST', action: 'apply_indexes', description: 'Apply database indexes' },
      { method: 'POST', action: 'clear_cache', description: 'Clear application caches' },
      { method: 'POST', action: 'analyze_queries', description: 'Analyze query performance' },
      { method: 'POST', action: 'full_optimization', description: 'Run all optimizations' },
    ],
  })
}
