// Local-first storage using localStorage (browser) or Capacitor Preferences (Android)
// Sync is manual / on-demand only
// AUDIT FIX: Added syncToServer() — POSTs collected beacons to /api/survey-points

import { FieldProject } from '@/types/field';

const PREFIX = 'metardu_field_';

export function saveProjectLocally(project: FieldProject): void {
  const updated = { ...project, updatedAt: Date.now(), syncedToServer: false };
  localStorage.setItem(`${PREFIX}${project.id}`, JSON.stringify(updated));
}

/**
 * AUDIT FIX: Sync a local field project to the server.
 * POSTs each beacon as a survey_point to /api/survey-points.
 * On success, marks the project as syncedToServer: true.
 */
export async function syncProjectToServer(project: FieldProject): Promise<{ synced: number; failed: number }> {
  if (!project.beacons || project.beacons.length === 0) {
    return { synced: 0, failed: 0 };
  }

  let synced = 0;
  let failed = 0;

  for (const beacon of project.beacons) {
    try {
      const res = await fetch('/api/survey-points', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: project.id,
          point_name: beacon.label || beacon.id,
          easting: beacon.coordinate?.lng ?? 0,  // lng = easting in WGS84
          northing: beacon.coordinate?.lat ?? 0,  // lat = northing in WGS84
          elevation: beacon.coordinate?.altitude ?? 0,
          code: 'BEACON',
          description: beacon.notes || '',
          is_control: false,
        }),
        credentials: 'include',
      });

      if (res.ok) {
        synced++;
      } else {
        failed++;
      }
    } catch {
      failed++;
    }
  }

  // Mark project as synced if all beacons uploaded
  if (failed === 0 && synced > 0) {
    const updated = { ...project, syncedToServer: true, updatedAt: Date.now() };
    localStorage.setItem(`${PREFIX}${project.id}`, JSON.stringify(updated));
  }

  return { synced, failed };
}

export function loadProjectLocally(id: string): FieldProject | null {
  const raw = localStorage.getItem(`${PREFIX}${id}`);
  return raw ? (JSON.parse(raw) as FieldProject) : null;
}

export function listLocalProjects(): FieldProject[] {
  const projects: FieldProject[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith(PREFIX)) {
      const raw = localStorage.getItem(key);
      if (raw) projects.push(JSON.parse(raw) as FieldProject);
    }
  }
  return projects.sort((a, b) => b.updatedAt - a.updatedAt);
}

export function deleteProjectLocally(id: string): void {
  localStorage.removeItem(`${PREFIX}${id}`);
}

export function generateProjectId(): string {
  return `fp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}
