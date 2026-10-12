/**
 * GET /api/project/[id]/deliverables
 *   ?includeSuperseded=true  — full revision lineage instead of live documents
 *   ?deliverableId=<uuid>    — revision history for one document
 *
 * The deliverable register read model (blueprint §15, §28). This is what makes
 * an issued document provable: its type, source data revision, current
 * revision, status, who issued/reviewed it, and every superseded revision's
 * content hash.
 */

import { NextResponse } from 'next/server'
import { apiHandler } from '@/lib/apiHandler'
import { requireProjectOwnership } from '@/lib/auth/ownership'
import {
  listDeliverableRevisions,
  listDeliverables,
  type DeliverableDocumentType,
} from '@/lib/deliverables/deliverableRegister'

export const dynamic = 'force-dynamic'

export const GET = apiHandler({ auth: true }, async (req, ctx) => {
  const params = await ctx.params
  const projectId = params?.id
  if (!projectId) {
    return NextResponse.json({ error: 'Project ID required' }, { status: 400 })
  }

  const ownership = await requireProjectOwnership(projectId, ctx.userId)
  if (!ownership.ok) {
    if (!ownership.error) throw new Error('Ownership check failed without an error response')
    return ownership.error
  }

  const deliverableId = req.nextUrl.searchParams.get('deliverableId')
  if (deliverableId) {
    const revisions = await listDeliverableRevisions(deliverableId)
    return NextResponse.json({ data: { revisions } })
  }

  const documentType = req.nextUrl.searchParams.get('documentType') as DeliverableDocumentType | null
  const includeSuperseded = req.nextUrl.searchParams.get('includeSuperseded') === 'true';

  const deliverables = await listDeliverables({
    projectId,
    documentType: documentType ?? undefined,
    includeSuperseded,
  });

  return NextResponse.json({ data: { deliverables } });
});
