/**
 * Verify Document Generation - Code-Level Verification
 * Checks that PDF/DOCX generation infrastructure exists and is properly configured
 */

import * as fs from 'fs'
import * as path from 'path'

const GREEN = '\x1b[32m'
const RED = '\x1b[31m'
const YELLOW = '\x1b[33m'
const RESET = '\x1b[0m'

interface CheckResult {
  name: string
  status: 'pass' | 'fail' | 'warn'
  details?: string
}

const results: CheckResult[] = []

function checkFile(filePath: string, description: string): boolean {
  const exists = fs.existsSync(filePath)
  results.push({
    name: description,
    status: exists ? 'pass' : 'fail',
    details: exists ? path.relative(process.cwd(), filePath) : 'File not found'
  })
  return exists
}

function checkStringInFile(filePath: string, searchString: string, description: string): boolean {
  if (!fs.existsSync(filePath)) {
    results.push({ name: description, status: 'fail', details: 'File not found' })
    return false
  }
  const content = fs.readFileSync(filePath, 'utf-8')
  const found = content.includes(searchString)
  results.push({
    name: description,
    status: found ? 'pass' : 'fail',
    details: found ? `Found "${searchString}"` : `Missing "${searchString}"`
  })
  return found
}

console.log('╔════════════════════════════════════════════════════════════════╗')
console.log('║  METARDU Document Generation Verification                       ║')
console.log('╚════════════════════════════════════════════════════════════════╝\n')

// 1. Check PDF Library
console.log('📄 PDF Generation Infrastructure:')
checkFile(path.join(process.cwd(), 'src/lib/pdf/generatePdf.ts'), 'PDF Generator Module')
checkStringInFile(
  path.join(process.cwd(), 'src/lib/pdf/generatePdf.ts'),
  'export async function generatePdf',
  'PDF Export Function'
)

// 2. Check DOCX Library
console.log('\n📝 DOCX Generation Infrastructure:')
checkFile(path.join(process.cwd(), 'src/lib/docx/generateDocx.ts'), 'DOCX Generator Module')
checkStringInFile(
  path.join(process.cwd(), 'src/lib/docx/generateDocx.ts'),
  'export async function generateDocx',
  'DOCX Export Function'
)

// 3. Check Templates
console.log('\n📋 Survey Templates:')
checkFile(path.join(process.cwd(), 'src/lib/docx/templates/index.ts'), 'Templates Index')
const templatesPath = path.join(process.cwd(), 'src/lib/docx/templates/index.ts')
if (fs.existsSync(templatesPath)) {
  const content = fs.readFileSync(templatesPath, 'utf-8')
  const templateCount = (content.match(/export const \w+Template/g) || []).length
  results.push({
    name: 'Survey Type Templates',
    status: templateCount >= 8 ? 'pass' : 'warn',
    details: `${templateCount} templates found`
  })
}

// 4. Check API Endpoint
console.log('\n🔌 API Endpoints:')
checkFile(path.join(process.cwd(), 'src/app/api/survey-report/export/route.ts'), 'Export API Route')
checkStringInFile(
  path.join(process.cwd(), 'src/app/api/survey-report/export/route.ts'),
  "const { reportId, format }",
  'Export Parameters'
)
checkStringInFile(
  path.join(process.cwd(), 'src/app/api/survey-report/export/route.ts'),
  "format === 'pdf'",
  'PDF Format Handler'
)
checkStringInFile(
  path.join(process.cwd(), 'src/app/api/survey-report/export/route.ts'),
  "format === 'docx'",
  'DOCX Format Handler'
)

// 5. Check UI Components
console.log('\n🖱️ UI Components:')
checkFile(
  path.join(process.cwd(), 'src/components/surveyreport/SurveyReportBuilder.tsx'),
  'Report Builder Component'
)
checkStringInFile(
  path.join(process.cwd(), 'src/components/surveyreport/SurveyReportBuilder.tsx'),
  "Download PDF",
  'PDF Download Button'
)
checkStringInFile(
  path.join(process.cwd(), 'src/components/surveyreport/SurveyReportBuilder.tsx'),
  "Download Word",
  'DOCX Download Button'
)
checkStringInFile(
  path.join(process.cwd(), 'src/components/surveyreport/SurveyReportBuilder.tsx'),
  "exportReport",
  'Export Handler Function'
)

// 6. Check Page Access
console.log('\n🔐 Access Control:')
checkFile(
  path.join(process.cwd(), 'src/app/tools/survey-report-builder/page.tsx'),
  'Report Builder Page'
)
checkStringInFile(
  path.join(process.cwd(), 'src/app/tools/survey-report-builder/page.tsx'),
  'useSession',
  'Auth Session Hook'
)
checkStringInFile(
  path.join(process.cwd(), 'src/app/tools/survey-report-builder/page.tsx'),
  'window.location.href',
  'Auth Redirect'
)

// Print results
console.log('\n' + '='.repeat(65))
console.log('VERIFICATION RESULTS')
console.log('='.repeat(65))

let pass = 0
let fail = 0
let warn = 0

results.forEach(r => {
  const icon = r.status === 'pass' ? '✅' : r.status === 'warn' ? '⚠️' : '❌'
  const color = r.status === 'pass' ? GREEN : r.status === 'warn' ? YELLOW : RED
  console.log(`${icon} ${color}${r.name}${RESET}`)
  if (r.details) {
    console.log(`   ${r.details}`)
  }
  if (r.status === 'pass') pass++
  else if (r.status === 'warn') warn++
  else fail++
})

console.log('='.repeat(65))
console.log(`\nSummary: ${GREEN}${pass} passed${RESET}, ${YELLOW}${warn} warnings${RESET}, ${RED}${fail} failed${RESET}`)

if (fail === 0) {
  console.log(`\n${GREEN}✅ Document Generation is FULLY CONFIGURED${RESET}`)
  console.log('All PDF and DOCX export components exist and are properly integrated.')
  process.exit(0)
} else {
  console.log(`\n${RED}❌ Document Generation has configuration issues${RESET}`)
  process.exit(1)
}
