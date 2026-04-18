import { createClient } from '@/lib/api-client/server';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import ProfileForm from './ProfileForm';

export default async function ProfileSettingsPage() {
  const dbClient = await createClient();

  const { data: { session } } = await dbClient.auth.getSession();
  if (!session) redirect('/login');

  const { data: profile } = await dbClient
    .from('profiles')
    .select('full_name, isk_number, firm_name, phone, email')
    .eq('id', session.user.id)
    .single();

  return (
    <div className="max-w-xl mx-auto px-4 py-8">
      <h1 className="text-xl font-bold text-gray-900 mb-1">Profile Settings</h1>
      <p className="text-sm text-gray-500 mb-6">
        Your name and ISK number appear on generated Deed Plans and survey certificates.
      </p>
      <ProfileForm initialData={profile ?? {}} userId={session.user.id} />
    </div>
  );
}
