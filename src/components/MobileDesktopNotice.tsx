interface MobileDesktopNoticeProps {
  title?: string
  children?: React.ReactNode
}

export default function MobileDesktopNotice({
  title = 'Desktop recommended',
  children,
}: MobileDesktopNoticeProps) {
  return (
    <div className="md:hidden rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
      <div className="font-semibold text-amber-300">{title}</div>
      <div className="mt-1 text-amber-100/85">
        {children ?? 'This workflow works best on a laptop or desktop because it uses wide tables, drawings, exports, and detailed review steps.'}
      </div>
    </div>
  )
}
