'use client';

import { useState } from 'react';
import { createClient } from '@/lib/api-client/client';

interface ProfileFormProps {
  initialData: {
    full_name?: string;
    isk_number?: string;
    firm_name?: string;
    phone?: string;
    email?: string;
  };
  userId: string;
}

export default function ProfileForm({ initialData, userId }: ProfileFormProps): JSX.Element {
  const [formData, setFormData] = useState({
    full_name: initialData.full_name ?? '',
    isk_number: initialData.isk_number ?? '',
    firm_name: initialData.firm_name ?? '',
    phone: initialData.phone ?? '',
  });
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setSaved(false);

    const dbClient = createClient();
    const { error } = await dbClient
      .from('profiles')
      .upsert({
        id: userId,
        full_name: formData.full_name,
        isk_number: formData.isk_number,
        firm_name: formData.firm_name,
        phone: formData.phone,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'id' });

    if (!error) {
      setSaved(true);
    }
    setLoading(false);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
        <input
          type="text"
          value={formData.full_name}
          onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">ISK Number</label>
        <input
          type="text"
          value={formData.isk_number}
          onChange={(e) => setFormData({ ...formData, isk_number: e.target.value })}
          placeholder="e.g. 1234"
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        />
        <p className="mt-1 text-xs text-gray-500">Your Institution of Surveyors of Kenya (ISK) license number.</p>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Firm Name</label>
        <input
          type="text"
          value={formData.firm_name}
          onChange={(e) => setFormData({ ...formData, firm_name: e.target.value })}
          placeholder="e.g. XYZ Surveyors Ltd"
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
        <input
          type="tel"
          value={formData.phone}
          onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        />
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={loading}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? 'Saving...' : 'Save Profile'}
        </button>
        {saved && <span className="text-green-600 text-sm">Profile saved!</span>}
      </div>
    </form>
  );
}
