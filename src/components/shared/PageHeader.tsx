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
 * PageHeader — v0.3 editorial dark header for all tool pages.
 *
 * Uses font-display (Instrument Serif) for the title, font-mono for the
 * reference crumb, and a flat badge. Applied across 56+ tool pages.
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
    <div className="mb-8 pb-5 border-b border-[var(--border-color)]">
      <div className="flex items-end justify-between gap-4">
        <div className="min-w-0">
          {badge && (
            <div className="font-mono text-[10px] text-[var(--accent)] tracking-[0.12em] uppercase mb-2">
              {badge}
            </div>
          )}
          <h1 className="font-display text-3xl md:text-4xl text-[var(--text-primary)] tracking-[-0.025em] leading-[1.1]">
            {title}
          </h1>
          {subtitle && (
            <p className="text-sm text-[var(--text-secondary)] mt-2 leading-relaxed max-w-[60ch]">
              {subtitle}
            </p>
          )}
          {reference && (
            <p className="font-mono text-[11px] text-[var(--text-muted)] mt-2 leading-relaxed tracking-[0.02em]">
              {reference}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
