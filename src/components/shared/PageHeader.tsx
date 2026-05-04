interface PageHeaderProps {
  /** Main page title e.g. "Level Book" */
  title: string
  /** Short description of the tool */
  subtitle?: string
  /** Standards reference string e.g. "RDM 1.1 (2025) Table 5.1 | Survey Regulations 1994" */
  reference?: string
  /** Short badge label e.g. "RDM 1.1" */
  badge?: string
}

/**
 * PageHeader — consistent page title block used on all tool pages.
 *
 * Usage:
 * ```tsx
 * <PageHeader
 *   title="Level Book"
 *   subtitle="Differential levelling with HPC / Rise & Fall reduction"
 *   reference="RDM 1.1 (2025) Table 5.1 | Survey Act Cap 299 | Survey Regulations 1994"
 *   badge="RDM 1.1"
 * />
 * ```
 */
export function PageHeader({ title, subtitle, reference, badge }: PageHeaderProps) {
  return (
    <div className="mb-8">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-3xl font-bold leading-tight">{title}</h1>
          {subtitle && (
            <p className="text-sm text-[var(--text-muted)] mt-1 leading-relaxed">{subtitle}</p>
          )}
          {reference && (
            <p className="text-xs text-[var(--text-muted)] mt-1 font-mono opacity-75 leading-relaxed">
              {reference}
            </p>
          )}
        </div>
        {badge && (
          <span className="shrink-0 text-xs font-mono px-2 py-1 rounded border border-[var(--border-color)] text-[var(--text-muted)] bg-[var(--bg-tertiary)] whitespace-nowrap">
            {badge}
          </span>
        )}
      </div>
    </div>
  )
}
