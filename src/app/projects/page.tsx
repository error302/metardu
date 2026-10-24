import Link from 'next/link'
import { redirect } from 'next/navigation'
import { FolderKanban, Plus } from 'lucide-react'
import ProjectCard, { type ProjectCardProject } from '@/components/ProjectCard'
import { getAuthUser } from '@/lib/auth/session'
import { setAuthenticatedDatabaseContext } from '@/lib/auth/requestContext'
import { db } from '@/lib/db'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'
const PAGE_SIZE = 24
type ProjectRow = Omit<ProjectCardProject, 'point_count' | 'parcel_count'> & {
  point_count: string | number; parcel_count: string | number; total_count: string | number
}

export default async function ProjectsPage({ searchParams }: { searchParams?: Promise<{ page?: string }> }) {
  const user = await getAuthUser()
  if (!user) redirect('/login?next=%2Fprojects')
  const params = await searchParams
  const requestedPage = Number(params?.page ?? '1')
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 && requestedPage <= 10000 ? requestedPage : 1
  let projects: ProjectCardProject[] = []
  let total: number | null = null
  let failed = false
  try {
    setAuthenticatedDatabaseContext(user.id)
    const { rows } = await db.query<ProjectRow>(
      `SELECT p.*, COUNT(*) OVER() AS total_count,
         (SELECT COUNT(*) FROM survey_points point WHERE point.project_id = p.id) AS point_count,
         (SELECT COUNT(*) FROM parcels parcel WHERE parcel.project_id = p.id) AS parcel_count
       FROM projects p WHERE p.user_id = $1
       ORDER BY p.created_at DESC, p.id DESC LIMIT $2 OFFSET $3`,
      [user.id, PAGE_SIZE, (page - 1) * PAGE_SIZE],
    )
    total = rows[0] ? Number(rows[0].total_count) : page === 1 ? 0 : null
    projects = rows.map(project => ({ ...project, point_count: Number(project.point_count), parcel_count: Number(project.parcel_count), countsAvailable: true }))
  } catch (error) {
    failed = true
    logger.error('[ProjectsPage] Could not load the owner project register', { error })
  }

  return <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
    <header className="flex flex-col items-start justify-between gap-4 border-b border-[var(--border-color)] pb-6 sm:flex-row sm:items-center">
      <div className="min-w-0">
        <p className="text-xs font-medium text-[var(--accent)]">Work mode / project register</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Projects</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--text-secondary)]">Open a survey to continue its field records, computations, drawings, and deliverables.</p>
      </div>
      <Link href="/project/new" prefetch={false} className="btn btn-primary inline-flex shrink-0 items-center gap-2"><Plus className="h-4 w-4" aria-hidden="true" /> New project</Link>
    </header>
    {failed ? <section role="alert" className="rounded-xl border border-red-500/30 bg-[var(--bg-card)] p-6">
      <h2 className="font-semibold">Projects could not be loaded</h2>
      <p className="mt-2 text-sm text-[var(--text-secondary)]">Your saved records have not changed. Try loading the register again.</p>
      <a href="/projects" className="btn btn-secondary mt-4 inline-flex">Retry projects</a>
    </section> : projects.length === 0 ? <section className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-6 sm:p-10">
      <FolderKanban className="h-8 w-8 text-[var(--accent)]" aria-hidden="true" />
      <h2 className="mt-4 text-xl font-semibold">{page === 1 ? 'No projects yet' : 'No projects on this page'}</h2>
      <p className="mt-2 max-w-xl text-sm leading-6 text-[var(--text-secondary)]">{page === 1 ? 'Create a project, declare its reference system, and keep the survey evidence together.' : 'Return to the first page to find your current survey projects.'}</p>
      <Link href={page === 1 ? '/project/new' : '/projects'} className="btn btn-secondary mt-5 inline-flex">{page === 1 ? 'Create your first project' : 'First page'}</Link>
    </section> : <>
      <p className="text-sm text-[var(--text-muted)]">{total === null ? `Page ${page}` : `${total.toLocaleString()} project${total === 1 ? '' : 's'} · page ${page}`}</p>
      <section aria-label="Your survey projects" className="grid items-start gap-5 md:grid-cols-2 xl:grid-cols-3">
        {projects.map(project => <ProjectCard key={project.id} project={project} openLabel="Open project" />)}
      </section>
    </>}
    {!failed && (page > 1 || (total !== null && page * PAGE_SIZE < total)) && <nav aria-label="Project register pages" className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border-color)] pt-5">
      {page > 1 ? <Link href={`/projects?page=${page - 1}`} className="btn btn-secondary">Previous page</Link> : <span />}
      {total !== null && page * PAGE_SIZE < total && <Link href={`/projects?page=${page + 1}`} className="btn btn-secondary">Next page</Link>}
    </nav>}
  </div>
}
