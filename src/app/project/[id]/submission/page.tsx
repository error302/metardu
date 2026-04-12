import { createClient } from '@/lib/supabase/server';
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

  const supabase = await createClient();

  const { data: project } = await supabase
    .from('projects')
    .select('id, name, survey_type')
    .eq('id', params.id)
    .eq('user_id', user.id)
    .single();

  if (!project) redirect('/dashboard');

  const { data: existingDocs } = await supabase
    .from('submission_documents')
    .select('*')
    .eq('project_id', params.id);

  const mappedDocs: ProjectDocument[] = (existingDocs ?? []).map((doc: any) => ({
    id: doc.id,
    project_id: doc.project_id,
    document_id: doc.document_id ?? doc.document_type ?? '',
    status: doc.status ?? 'pending',
    file_url: doc.file_url ?? doc.file_path ?? null,
    error_message: doc.error_message ?? null,
    generated_at: doc.generated_at ?? doc.created_at ?? null,
    created_at: doc.created_at ?? new Date().toISOString(),
  }));

  return (
    <SubmissionClient
      project={{
        id: project.id,
        name: project.name,
        survey_type: normalizeSurveyType(project.survey_type),
      }}
      existingDocs={mappedDocs}
      projectId={params.id}
    />
  );
}
