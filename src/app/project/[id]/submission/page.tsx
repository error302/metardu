import { createClient } from '@/lib/supabase/client';
import { redirect } from 'next/navigation';
import SubmissionClient from './SubmissionClient';

interface Props {
  params: { id: string };
}

export default async function SubmissionPage({ params }: Props) {
  const supabase = createClient();
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) redirect('/login');

  const { data: project } = await supabase
    .from('projects')
    .select('id, name, survey_type')
    .eq('id', params.id)
    .eq('user_id', session.user.id)
    .single();

  if (!project) redirect('/dashboard');

  const { data: existingDocs } = await supabase
    .from('submission_documents')
    .select('*')
    .eq('project_id', params.id);

  return (
    <SubmissionClient
      project={project}
      existingDocs={existingDocs ?? []}
      projectId={params.id}
    />
  );
}