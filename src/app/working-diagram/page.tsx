import { createClient } from '@/lib/supabase/server';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import WorkingDiagramClient from './WorkingDiagramClient';

interface Props {
  searchParams: { projectId?: string };
}

export default async function WorkingDiagramPage({ searchParams }: Props) {
  const { projectId } = searchParams;
  if (!projectId) redirect('/projects');

  const supabase = await createClient();

  const { data: { session } } = await supabase.auth.getSession();
  if (!session) redirect('/login');

  const { data: project } = await supabase
    .from('projects')
    .select(`
      id, name, survey_type, lr_number, locality,
      registration_district, utm_zone, hemisphere, datum
    `)
    .eq('id', projectId)
    .eq('user_id', session.user.id)
    .single();

  if (!project) redirect('/projects');

  const { data: entries } = await supabase
    .from('project_fieldbook_entries')
    .select('row_index, station, raw_data, bs, remark')
    .eq('project_id', projectId)
    .order('row_index', { ascending: true });

  return (
    <WorkingDiagramClient
      project={project}
      entries={entries ?? []}
      projectId={projectId}
    />
  );
}
