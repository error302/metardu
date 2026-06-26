/**
 * METARDU Security Audit Script
 * Scans codebase for security vulnerabilities before deployment
 * 
 * Run: npx tsx scripts/security-audit.ts
 */

import * as fs from 'fs'
import * as path from 'path'
import { glob } from 'glob'

interface SecurityIssue {
  file: string
  line: number
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'
  type: string
  message: string
  suggestion: string
}

const PATTERNS = {
  // Hardcoded secrets
  hardcodedPassword: {
    regex: /(?:password|passwd|pwd)\s*[:=]\s*['"][^'"]{4,}['"]/gi,
    severity: 'CRITICAL',
    type: 'Hardcoded Secret',
    message: 'Hardcoded password detected',
    suggestion: 'Use environment variables instead',
  },
  hardcodedApiKey: {
    regex: /(?:api[_-]?key|apikey)\s*[:=]\s*['"][a-zA-Z0-9_-]{20,}['"]/gi,
    severity: 'CRITICAL',
    type: 'Hardcoded API Key',
    message: 'Hardcoded API key detected',
    suggestion: 'Use environment variables',
  },
  supabaseServiceRole: {
    regex: /eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9\.eyJ[^(('|")]*/gi,
    severity: 'CRITICAL',
    type: 'Supabase Service Role',
    message: 'Supabase service role key detected',
    suggestion: 'Remove immediately and use environment variables',
  },
  
  // Security misconfigurations
  disableLinting: {
    regex: /\/\*\s*eslint-disable\s*\*\//gi,
    severity: 'MEDIUM',
    type: 'Disabled ESLint',
    message: 'ESLint disabled',
    suggestion: 'Review and fix linting issues instead of disabling',
  },
  ignoreBuildErrors: {
    regex: /ignoreBuildErrors\s*:\s*true/gi,
    severity: 'HIGH',
    type: 'Build Errors Ignored',
    message: 'TypeScript build errors are being ignored',
    suggestion: 'Fix type errors instead of ignoring them',
  },
  
  // SQL Injection risks
  rawSqlConcat: {
    regex: /(?:SELECT|INSERT|UPDATE|DELETE).*\+\s*\$\{?/gi,
    severity: 'CRITICAL',
    type: 'SQL Injection Risk',
    message: 'Raw SQL with string concatenation detected',
    suggestion: 'Use parameterized queries',
  },
  
  // XSS risks
  dangerouslySetInnerHTML: {
    regex: /dangerouslySetInnerHTML/gi,
    severity: 'HIGH',
    type: 'XSS Risk',
    message: 'dangerouslySetInnerHTML usage detected',
    suggestion: 'Sanitize HTML content before rendering',
  },
  
  // Authentication bypasses
  skipAuth: {
    regex: /(?:skip|bypass|disable).*(?:auth|security)/gi,
    severity: 'HIGH',
    type: 'Auth Bypass',
    message: 'Authentication bypass detected',
    suggestion: 'Review authentication requirements',
  },
} as const

async function scanFile(filePath: string): Promise<SecurityIssue[]> {
  const content = fs.readFileSync(filePath, 'utf-8')
  const issues: SecurityIssue[] = []
  
  for (const [patternName, pattern] of Object.entries(PATTERNS)) {
    const lines = content.split('\n')
    lines.forEach((line, index) => {
      if (pattern.regex.test(line)) {
        issues.push({
          file: filePath,
          line: index + 1,
          severity: pattern.severity as any,
          type: pattern.type,
          message: pattern.message,
          suggestion: pattern.suggestion,
        })
      }
    })
  }
  
  return issues
}

async function scanDirectory(dir: string, exclude: string[] = []): Promise<SecurityIssue[]> {
  const files = await glob(`${dir}/**/*.{ts,tsx,js,jsx,json,yml,yaml}`)
  const allIssues: SecurityIssue[] = []
  
  for (const file of files) {
    // Skip excluded directories
    if (exclude.some(ex => file.includes(ex))) continue
    if (file.includes('node_modules') || file.includes('.next') || file.includes('.git')) continue
    
    const issues = await scanFile(file)
    allIssues.push(...issues)
  }
  
  return allIssues
}

async function checkEnvironmentVariables(): Promise<void> {
  console.log('\n🔐 Checking environment variable usage...')
  
  const envFiles = ['.env', '.env.local', '.env.example', '.env.test']
  let hasExposedSecrets = false
  
  for (const envFile of envFiles) {
    if (fs.existsSync(envFile)) {
      const content = fs.readFileSync(envFile, 'utf-8')
      
      // Check for real-looking secrets
      if (content.includes('sk_live_') || content.includes('pk_live_')) {
        console.log(`  ❌ ${envFile}: Contains live Stripe keys!`)
        hasExposedSecrets = true
      }
      
      // Check for Supabase keys
      if (content.includes('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ')) {
        console.log(`  ❌ ${envFile}: Contains Supabase JWT!`)
        hasExposedSecrets = true
      }
    }
  }
  
  if (!hasExposedSecrets) {
    console.log('  ✅ No obvious secrets found in env files')
  }
}

async function checkSupabaseRemnants(): Promise<void> {
  console.log('\n🔍 Scanning for Supabase remnants...')
  
  const supabasePatterns = [
    'createClient',
    'createServerClient',
    'createBrowserClient',
    '@supabase/supabase-js',
    'supabase.rpc',
    'from(\'',
  ]
  
  const files = await glob('src/**/*.{ts,tsx}')
  let foundSupabase = false
  
  for (const file of files) {
    const content = fs.readFileSync(file, 'utf-8')
    
    for (const pattern of supabasePatterns) {
      if (content.includes(pattern) && !file.includes('supabase')) {
        console.log(`  ⚠️  ${file}: Contains "${pattern}"`)
        foundSupabase = true
      }
    }
  }
  
  if (!foundSupabase) {
    console.log('  ✅ No Supabase client usage detected')
  }
}

async function main() {
  console.log('🔐 METARDU Security Audit')
  console.log('=' .repeat(60))
  
  const startTime = Date.now()
  
  // Scan codebase
  console.log('\n📁 Scanning codebase...')
  const issues = await scanDirectory('src', ['node_modules', '.next', 'dist'])
  
  // Group by severity
  const critical = issues.filter(i => i.severity === 'CRITICAL')
  const high = issues.filter(i => i.severity === 'HIGH')
  const medium = issues.filter(i => i.severity === 'MEDIUM')
  const low = issues.filter(i => i.severity === 'LOW')
  
  // Report
  console.log('\n' + '='.repeat(60))
  console.log('📊 SECURITY AUDIT RESULTS')
  console.log('='.repeat(60))
  
  if (critical.length > 0) {
    console.log(`\n❌ CRITICAL (${critical.length}):`)
    critical.forEach(issue => {
      console.log(`   ${issue.file}:${issue.line} - ${issue.message}`)
      console.log(`      → ${issue.suggestion}`)
    })
  }
  
  if (high.length > 0) {
    console.log(`\n⚠️  HIGH (${high.length}):`)
    high.forEach(issue => {
      console.log(`   ${issue.file}:${issue.line} - ${issue.message}`)
    })
  }
  
  if (medium.length > 0) {
    console.log(`\n🔶 MEDIUM (${medium.length}):`)
    medium.forEach(issue => {
      console.log(`   ${issue.file}:${issue.line} - ${issue.message}`)
    })
  }
  
  if (low.length > 0) {
    console.log(`\n🔵 LOW (${low.length}):`)
    low.forEach(issue => {
      console.log(`   ${issue.file}:${issue.line} - ${issue.message}`)
    })
  }
  
  // Additional checks
  await checkEnvironmentVariables()
  await checkSupabaseRemnants()
  
  // Summary
  const duration = ((Date.now() - startTime) / 1000).toFixed(2)
  console.log('\n' + '='.repeat(60))
  console.log(`📈 Summary: ${critical.length} critical, ${high.length} high, ${medium.length} medium, ${low.length} low`)
  console.log(`⏱️  Duration: ${duration}s`)
  console.log('='.repeat(60))
  
  // Exit with error if critical or high issues found
  if (critical.length > 0 || high.length > 0) {
    console.log('\n❌ Security audit FAILED - Fix critical/high issues before deployment')
    process.exit(1)
  } else {
    console.log('\n✅ Security audit PASSED')
    process.exit(0)
  }
}

main().catch(console.error)
