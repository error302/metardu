'use client';

import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { AdjustedStation } from '@/lib/engine/planGeometry';

const SurveyMap = dynamic(() => import('@/components/map/SurveyMap'), { ssr: false });

interface MapPageProps {
  params: { id: string };
}

export default function MapPage({ params }: MapPageProps) {
  const [stations, setStations] = useState<AdjustedStation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const supabase = createClient();

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setError('Not authenticated'); return; }

      const { data: project, error: projErr } = await supabase
        .from('projects')
        .select('boundary_data, id')
        .eq('id', params.id)
        .single();

      if (projErr || !project) {
        setError('Project not found');
        setLoading(false);
        return;
      }

      const raw = project.boundary_data?.adjustedStations ?? [];
      if (raw.length < 3) {
        setError('No adjusted traverse data found. Complete the traverse computation first.');
        setLoading(false);
        return;
      }

      const mapped: AdjustedStation[] = raw.map((s: any) => ({
        pointName: s.pointName ?? s.label ?? s.id ?? String(s.station),
        originalEasting: Number(s.originalEasting ?? s.easting ?? 0),
        originalNorthing: Number(s.originalNorthing ?? s.northing ?? 0),
        adjustedEasting: Number(s.adjustedEasting ?? s.easting ?? 0),
        adjustedNorthing: Number(s.adjustedNorthing ?? s.northing ?? 0),
      }));

      setStations(mapped);
      setLoading(false);
    }

    load();
  }, [params.id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-gray-500">
        Loading traverse data...
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <p className="text-sm text-red-600 font-medium">{error}</p>
          <p className="text-xs text-gray-500 mt-1">
            Ensure the traverse has been computed and adjusted before viewing the map.
          </p>
        </div>
      </div>
    );
  }

  const sumE = stations.reduce((sum, s) => sum + s.adjustedEasting, 0);
  const sumN = stations.reduce((sum, s) => sum + s.adjustedNorthing, 0);
  const centroidEasting = sumE / stations.length;
  const centroidNorthing = sumN / stations.length;

  return (
    <div className="h-full flex flex-col">
      <SurveyMap
        projectId={params.id}
        adjustedStations={stations}
        centroidEasting={centroidEasting}
        centroidNorthing={centroidNorthing}
        readOnly={true}
      />
    </div>
  );
}