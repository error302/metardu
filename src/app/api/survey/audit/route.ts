// ──────────────────────────────────────────────────────────────────────────
// METARDU — Audit Trail API Routes
// ──────────────────────────────────────────────────────────────────────────
// GET  /api/survey/audit?projectId=...     → List audit entries
// GET  /api/survey/audit?surveyId=...      → List audit entries for survey
// GET  /api/survey/audit?id=...            → Get single entry
// GET  /api/survey/audit/stats?projectId=... → Get statistics
// GET  /api/survey/audit/verify?projectId=... → Verify chain integrity
// GET  /api/survey/audit/export?projectId=...&format=json|text → Export report
// POST /api/survey/audit                    → Store new audit entry
// ──────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { setCurrentUserId } from '@/lib/db';
import { checkProjectAccess } from '@/lib/security/projectAccess';
import {
  storeAuditEntry,
  getAuditEntriesBySurvey,
  getAuditEntriesByProject,
  getAuditEntryById,
  getAuditStats,
  verifyAuditChain,
} from '@/lib/survey/audit-store';
import {
  AuditTrail,
  type AuditOperation,
  type CorrectionRecord,
  type AccuracyCheckResult,
} from '@/lib/survey/audit-trail';
import { logger } from '@/lib/logger'

interface AuditEntryBody {
  surveyId: string
  projectId: string
  userId?: string
  operation: AuditOperation
  inputs: Record<string, unknown>
  outputs: Record<string, unknown>
  correctionsApplied?: CorrectionRecord[]
  formula: string
  reference: string
  durationMs?: number
  accuracyCheck?: AccuracyCheckResult | null
  [key: string]: unknown
}

// ─── GET Handler ─────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  // Auth check
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  setCurrentUserId(userId);
  const canReadProject = async (projectId: string) =>
    (await checkProjectAccess(userId, projectId)).allowed;

  const { searchParams } = new URL(request.url);

  // ── Single entry by ID ──
  const id = searchParams.get('id');
  if (id) {
    const entry = await getAuditEntryById(id);
    if (!entry) {
      return NextResponse.json({ error: 'Audit entry not found' }, { status: 404 });
    }
    if (!(await canReadProject(entry.projectId))) {
      return NextResponse.json({ error: 'Audit entry not found' }, { status: 404 });
    }
    return NextResponse.json(entry);
  }

  // ── Chain verification ──
  if (searchParams.has('verify')) {
    const projectId = searchParams.get('projectId') || searchParams.get('verify');
    if (!projectId) {
      return NextResponse.json({ error: 'projectId required for verification' }, { status: 400 });
    }
    if (!(await canReadProject(projectId))) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }
    const result = await verifyAuditChain(projectId);
    return NextResponse.json(result);
  }

  // ── Statistics ──
  if (searchParams.has('stats')) {
    const projectId = searchParams.get('projectId') || searchParams.get('stats');
    if (!projectId) {
      return NextResponse.json({ error: 'projectId required for stats' }, { status: 400 });
    }
    if (!(await canReadProject(projectId))) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }
    const stats = await getAuditStats(projectId);
    return NextResponse.json(stats);
  }

  // ── Export report ──
  if (searchParams.has('export')) {
    const projectId = searchParams.get('projectId');
    if (!projectId) {
      return NextResponse.json({ error: 'projectId required for export' }, { status: 400 });
    }
    if (!(await canReadProject(projectId))) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }
    const format = searchParams.get('format') || 'json';

    if (format === 'text') {
      const entries = await getAuditEntriesByProject(projectId);
      // Reconstruct trail for export (entries already in order)
      const report = [
        '═══════════════════════════════════════════════════════════════',
        '  METARDU — Survey Computation Audit Report',
        '═══════════════════════════════════════════════════════════════',
        '',
        `  Project ID:     ${projectId}`,
        `  Generated:      ${new Date().toISOString()}`,
        `  Entries:        ${entries.length}`,
        '',
        '───────────────────────────────────────────────────────────────',
        '',
      ];

      for (const e of entries) {
        report.push(`  [${e.operation.toUpperCase().replace(/_/g, ' ')}]`);
        report.push(`    Timestamp:  ${e.timestamp}`);
        report.push(`    Survey:     ${e.surveyId}`);
        report.push(`    User:       ${e.userId}`);
        report.push(`    Formula:    ${e.formula}`);
        report.push(`    Reference:  ${e.reference}`);
        report.push(`    Checksum:   ${e.checksum.substring(0, 24)}…`);
        if (e.accuracyCheck) {
          report.push(`    Accuracy:   ${e.accuracyCheck.passed ? 'PASS' : 'FAIL'} — ${e.accuracyCheck.details}`);
        }
        report.push('');
      }

      report.push('═══════════════════════════════════════════════════════════════');

      return new NextResponse(report.join('\n'), {
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Content-Disposition': `attachment; filename="audit-report-${projectId}.txt"`,
        },
      });
    }

    // JSON format
    const entries = await getAuditEntriesByProject(projectId);
    const chainResult = await verifyAuditChain(projectId);
    return NextResponse.json({
      projectId,
      generatedAt: new Date().toISOString(),
      chainValid: chainResult.valid,
      chainDetails: chainResult.details,
      entries,
    });
  }

  // ── List entries ──
  const surveyId = searchParams.get('surveyId');
  const projectId = searchParams.get('projectId');

  if (surveyId) {
    const entries = await getAuditEntriesBySurvey(surveyId);
    const projectIds = [...new Set(entries.map((entry) => entry.projectId))]
    const accessByProject = new Map<string, boolean>()
    await Promise.all(projectIds.map(async (id) => accessByProject.set(id, await canReadProject(id))))
    const visibleEntries = entries.filter((entry) => accessByProject.get(entry.projectId))
    return NextResponse.json({ entries: visibleEntries, count: visibleEntries.length });
  }

  if (projectId) {
    if (!(await canReadProject(projectId))) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }
    const entries = await getAuditEntriesByProject(projectId);
    return NextResponse.json({ entries, count: entries.length });
  }

  return NextResponse.json(
    { error: 'Provide id, surveyId, projectId, or action parameter (verify/stats/export)' },
    { status: 400 }
  );
}

// ─── POST Handler ────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  // Auth check
  const session = await getServerSession(authOptions);
  const authenticatedUserId = session?.user?.id;
  if (!authenticatedUserId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  setCurrentUserId(authenticatedUserId);

  try {
    const body = (await request.json()) as AuditEntryBody;

    // Validate required fields
    const required = ['surveyId', 'projectId', 'operation', 'inputs', 'outputs', 'formula', 'reference'];
    for (const field of required) {
      if (!body[field]) {
        return NextResponse.json({ error: `Missing required field: ${field}` }, { status: 400 });
      }
    }

    if (!(await checkProjectAccess(authenticatedUserId, body.projectId)).allowed) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    // Create audit entry with checksums
    const trail = new AuditTrail();
    const entry = trail.record({
      surveyId: body.surveyId,
      projectId: body.projectId,
      userId: authenticatedUserId,
      operation: body.operation,
      inputs: body.inputs,
      outputs: body.outputs,
      correctionsApplied: body.correctionsApplied || [],
      formula: body.formula,
      reference: body.reference,
      durationMs: body.durationMs || 0,
      accuracyCheck: body.accuracyCheck || null,
    });

    // Persist to database
    await storeAuditEntry(entry);

    return NextResponse.json(entry, { status: 201 });
  } catch (err) {
    logger.error('[Audit API] POST error:', { error: err });
    return NextResponse.json(
      { error: 'Failed to store audit entry', details: String(err) },
      { status: 500 }
    );
  }
}
