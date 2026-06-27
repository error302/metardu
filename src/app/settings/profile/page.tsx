import { createClient } from '@/lib/api-client/server';
import { redirect } from 'next/navigation';
import ProfileForm from './ProfileForm';

export default async function ProfileSettingsPage() {
  const dbClient = await createClient();

  const { data: { session } } = await dbClient.auth.getSession();
  if (!session) redirect('/login');

  const userId = (session as { user?: { id?: string; email?: string; name?: string } } | null)?.user?.id as string

  let profile: Record<string, unknown> | null = null
  let dbError = false

  try {
    const { data } = await dbClient
      .from('profiles')
      .select('full_name, isk_number, firm_name, phone, email')
      .eq('id', userId)
      .single();
    profile = data as Record<string, unknown> | null
  } catch {
    dbError = true
  }

  return (
    <div className="max-w-xl mx-auto px-4 py-8">
      <h1 className="text-xl font-bold text-[var(--text-primary)] mb-1">Profile Settings</h1>
      <p className="text-sm text-[var(--text-secondary)] mb-6">
        Your name and ISK number appear on generated Deed Plans and survey certificates.
      </p>
      {dbError ? (
        <div className="p-4 rounded-lg border border-amber-500/30 bg-amber-500/5 text-amber-400 text-sm">
          Unable to load profile data. The database may be temporarily unavailable.
          You can still update your profile below once the connection is restored.
        </div>
      ) : null}
      <ProfileForm initialData={profile ?? {}} userId={userId} />
    </div>
  );
}
