// Local-first storage using localStorage (browser) or Capacitor Preferences (Android)
// Sync is manual / on-demand only

import { FieldProject } from '@/types/field';

const PREFIX = 'metardu_field_';

export function saveProjectLocally(project: FieldProject): void {
  const updated = { ...project, updatedAt: Date.now(), syncedToSupabase: false };
  localStorage.setItem(`${PREFIX}${project.id}`, JSON.stringify(updated));
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
