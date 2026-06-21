import { createClient } from '@/lib/api-client/server';
import { getAuthUser } from '@/lib/auth/session';
import { redirect } from 'next/navigation';
import SubmissionClient from './SubmissionClient';
import type { ProjectDocument } from '@/types/submission';
import type { SurveyType } from '@/types/project';

interface Props {
  params: { id: string };
}

function normalizeSurveyType(subtype: string | null | undefined): SurveyType {
  const value = (subtype ?? '').toLowerCase();
  if (value.includes('cadastral') || value.includes('boundary')) return 'cadastral';
  if (value.includes('engineering') || value.includes('road') || value.includes('construction')) return 'engineering';
  if (value.includes('geodetic') || value.includes('control')) return 'geodetic';
  if (value.includes('mining')) return 'mining';
  if (value.includes('hydro')) return 'hydrographic';
  if (value.includes('drone') || value.includes('uav')) return 'drone';
  if (value.includes('deformation') || value.includes('monitor')) return 'deformation';
  return 'topographic';
}

export default async function SubmissionPage({ params }: Props) {
  const user = await getAuthUser();
  if (!user) redirect('/login');

  const dbClient = await createClient();

  const { data: project } = await dbClient
    .from('projects')
    .select('id, name, survey_type')
    .eq('id', params.id)
    .eq('user_id', user.id)
    .single();

  if (!project) redirect('/dashboard');

  const { data: existingDocs } = await dbClient
    .from('submission_documents')
    .select('*')
    .eq('project_id', params.id);

  const docsArray = (existingDocs as Record<string, unknown>[] | null) ?? [];
  // ponytail: cast via unknown — the mapped shape only carries the DB-side fields
  // (id/document_id/status/file_url/etc.) that SubmissionClient actually reads via
  // .find(d => d.document_id === ...).status. The full ProjectDocument interface
  // also requires `type/label/required`, but those are sourced from a separate
  // static manifest at the client — the legacy `any` cast on `doc` hid this gap.
  const mappedDocs = docsArray.map((doc) => ({
    id: doc.id as string,
    project_id: doc.project_id as string,
    document_id: (doc.document_id ?? doc.document_type ?? '') as string,
    status: (doc.status ?? 'pending') as string,
    file_url: (doc.file_url ?? doc.file_path ?? null) as string | null,
    error_message: (doc.error_message ?? null) as string | null,
    generated_at: (doc.generated_at ?? doc.created_at ?? null) as string | null,
    created_at: (doc.created_at ?? new Date().toISOString()) as string,
  })) as unknown as ProjectDocument[];

  const projectRow = project as Record<string, unknown>;

  return (
    <SubmissionClient
      project={{
        id: projectRow.id as string,
        name: projectRow.name as string,
        survey_type: normalizeSurveyType(projectRow.survey_type as string | null | undefined),
      }}
      existingDocs={mappedDocs}
      projectId={params.id}
    />
  );
}
