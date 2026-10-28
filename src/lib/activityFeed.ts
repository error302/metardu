/**
 * Dashboard feed: personal entries plus durable records in readable projects.
 * Keep raw audit payloads, other users' personal events and account events private.
 * The projects CTE uses both canonical grants and the restricted connection's RLS.
 */
export const activityFeedQuery = `
WITH readable_projects AS MATERIALIZED (
  SELECT p.id, p.name, p.user_id, p.created_at
  FROM projects p
  WHERE p.user_id IS NOT NULL
    AND ($4::uuid IS NULL OR p.id = $4)
    AND (
      (p.organization_id IS NULL AND (
        p.user_id = $1::uuid OR public.has_personal_project_read_grant(p.id)
      ))
      OR (
        p.organization_id = public.current_org_id()
        AND public.has_active_organization_role(p.organization_id)
      )
    )
),
events AS (
  SELECT 'personal:' || a.id::text AS id, a.project_id, a.activity_type,
    a.entity_type, a.description, a.created_at,
    p.name AS project_name, 'You'::text AS actor_name,
    'personal'::text AS source
  FROM user_activity a
  LEFT JOIN readable_projects p ON p.id = a.project_id
  WHERE a.user_id = $1::uuid
    AND (a.project_id IS NULL OR p.id IS NOT NULL)
    AND ($4::uuid IS NULL OR a.project_id = $4)
  UNION ALL
  SELECT 'project:' || p.id::text, p.id, 'project_created', 'project',
    'Project created', p.created_at, p.name,
    CASE WHEN p.user_id = $1::uuid THEN 'You' ELSE 'Project owner' END,
    'project_record'
  FROM readable_projects p
  WHERE NOT EXISTS (
    SELECT 1 FROM user_activity a
    WHERE a.user_id = $1::uuid AND a.project_id = p.id
      AND a.activity_type = 'project_created'
  )
  UNION ALL
  SELECT 'audit:' || a.id::text, a.project_id, 'project_updated', a.entity_type,
    initcap(replace(left(a.entity_type, 80), '_', ' ')) || ' · ' ||
      replace(left(a.action, 80), '_', ' '),
    a.created_at, p.name,
    CASE WHEN a.user_id = $1::uuid THEN 'You'
      ELSE COALESCE(NULLIF(a.user_name, ''), 'Project teammate') END,
    'project_audit'
  FROM audit_chain a
  JOIN readable_projects p ON p.id = a.project_id
  WHERE a.entity_type <> 'system'
)
SELECT id, project_id, activity_type, entity_type, description, created_at,
  project_name, actor_name, source
FROM events
ORDER BY created_at DESC, id DESC
LIMIT $2 OFFSET $3
`

export interface ActivityFeedRow {
  id: string
  project_id: string | null
  activity_type: string
  entity_type: string | null
  description: string
  created_at: Date
  project_name: string | null
  actor_name: string
  source: 'personal' | 'project_record' | 'project_audit'
}
