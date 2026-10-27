/**
 * POST /api/project/[id]/qa — record a QA run (blueprint §2.5, §16)
 * GET  /api/project/[id]/qa — the QA evidence for a project (Verify stage)
 *
 * A QA result is only meaningful when it states what was checked, what was
 * measured, what it was measured against, and under which data/design revision
 * and tolerance-profile revision. This endpoint is where that record is made,
 * so a PASS can be defended months later.
 */

import { NextResponse } from 'next/server'
import { createHash } from 'node:crypto'
import { z } from 'zod'
import { apiHandler } from '@/lib/apiHandler'
import { requireProjectOwnership } from '@/lib/auth/ownership'
import {
  listQaRuns,
  recordQaRun,
} from '@/lib/provenance/computationAndQa'

export const dynamic = 'force-dynamic'

const evidenceResult = z.object({
  checkType: z.string().trim().min(1, 'Each result needs a checkType').max(80),
  result: z.enum(['PASS', 'WARN', 'FAIL', 'INFO']),
  measuredValue: z.number().finite().nullable().optional(),
  thresholdValue: z.number().finite().nullable().optional(),
  unit: z.string().trim().min(1).max(20).nullable().optional(),
  message: z.string().max(4000).nullable().optional(),
  details: z.record(z.string(), z.unknown()).prefault({}),
}).strict();
const manualRun = z.object({
  trigger: z.literal('manual').optional(),
  dataRevision: z.string().trim().min(1).max(60).nullable().optional(),
  designRevision: z.string().trim().min(1).max(60).nullable().optional(),
  // Keep the exact submitted inputs, rather than fingerprinting verdict counts.
  inputSnapshot: z.string().min(2).max(250000).optional(),
  results: z.array(evidenceResult).min(1, 'A QA run needs at least one result').max(200),
}).strict();

export const POST = apiHandler({ auth: true }, async (_req, ctx) => {
  const projectId = (await ctx.params)?.id;
  if (!projectId) return NextResponse.json({ error: 'Project ID required' }, { status: 400 });
  const ownership = await requireProjectOwnership(projectId, ctx.userId);
  if (!ownership.ok) {
    if (!ownership.error) throw new Error('Ownership check failed without an error response');
    return ownership.error;
  }
  if (ownership.projectUserId !== ctx.userId) {
    return NextResponse.json({ error: 'QA recording requires a claimed project owner' }, { status: 403 });
  }
  const parsed = manualRun.safeParse(ctx.body);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid QA evidence', issues: parsed.error.issues }, { status: 400 });
  const body = parsed.data;
  let inputSnapshot: Record<string, unknown> | undefined;
  if (body.inputSnapshot) {
    try {
      const value: unknown = JSON.parse(body.inputSnapshot, (_key, item: unknown) => {
        if (typeof item === 'number' && !Number.isFinite(item)) throw new Error('Non-finite input');
        return item;
      });
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Object snapshot required');
      inputSnapshot = value as Record<string, unknown>;
    } catch {
      return NextResponse.json({ error: 'inputSnapshot must contain a finite JSON object' }, { status: 400 });
    }
  }
  const dataRevision = inputSnapshot
    ? `sha256:${createHash('sha256').update(JSON.stringify(inputSnapshot)).digest('base64url')}`
    : body.dataRevision ?? null;
  for (const item of body.results) {
    if (item.result === 'INFO') continue;
    const { rule, comparison } = item.details;
    if (!dataRevision || item.measuredValue == null || item.thresholdValue == null || !item.unit
      || typeof rule !== 'string' || !rule.trim() || rule.length > 2000
      || !['lte', 'gte', 'eq'].includes(String(comparison))) {
      return NextResponse.json({ error: 'Verdicts require an input revision, measurement, threshold, unit and comparison rule' }, { status: 400 });
    }
    const passes = comparison === 'lte' ? item.measuredValue <= item.thresholdValue
      : comparison === 'gte' ? item.measuredValue >= item.thresholdValue : item.measuredValue === item.thresholdValue;
    if ((item.result === 'PASS' && !passes) || (item.result === 'FAIL' && passes)) {
      return NextResponse.json({ error: 'QA verdict contradicts its measurement and comparison rule' }, { status: 400 });
    }
  }
  const summary = await recordQaRun({
    projectId, dataRevision, designRevision: body.designRevision ?? null,
    userId: ctx.userId, trigger: 'manual', toleranceProfile: null, requireOwner: true,
    results: body.results.map((item, index) => ({ ...item, details: {
      ...item.details, evidenceSource: 'client_reported', certified: false,
      inputRevision: dataRevision, ...(inputSnapshot && index === 0 ? { inputSnapshot } : {}),
    } })),
  });
  return NextResponse.json({ data: { ...summary, dataRevision, evidenceSource: 'client_reported', certified: false } }, {
    status: 201, headers: { 'Cache-Control': 'private, no-store' },
  });
});

export const GET = apiHandler({ auth: true }, async (req, ctx) => {
  const params = await ctx.params;
  const projectId = params?.id;
  if (!projectId) {
    return NextResponse.json({ error: 'Project ID required' }, { status: 400 });
  }

  const ownership = await requireProjectOwnership(projectId, ctx.userId);
  if (!ownership.ok) {
    if (!ownership.error) throw new Error('Ownership check failed without an error response');
    return ownership.error;
  }

  const limitParam = Number(req.nextUrl.searchParams.get('limit') ?? '10');
  const limit = Number.isFinite(limitParam) ? Math.trunc(limitParam) : 10;
  const runs = await listQaRuns(projectId, limit);
  return NextResponse.json({ data: { runs } }, { headers: { 'Cache-Control': 'private, no-store' } });
});
