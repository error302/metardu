'use client';

import { useEffect } from 'react';
import { registerProjections } from '@/lib/map/projection';

export function ProjectionInit() {
  useEffect(() => { registerProjections(); }, []);
  return null;
}