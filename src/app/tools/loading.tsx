import { RouteLoading } from '@/components/shared/RouteLoading'

export default function ToolsLoading() {
  return (
    <RouteLoading
      label="Loading tools"
      height={260}
      lines={[
        'Calibrating instruments…',
        'Loading computation modules…',
        'Preparing tool bench…',
      ]}
      skeleton={
        <div className="grid md:grid-cols-2 gap-6">
          {Array.from({ length: 2 }, (_, i) => (
            <div key={`skel-${i}`} className="card animate-pulse">
              <div className="card-header h-8 bg-[var(--bg-tertiary)]" />
              <div className="card-body space-y-4">
                {Array.from({ length: 4 }, (_, j) => (
                  <div key={`skel-${i}-${j}`} className="h-10 rounded bg-[var(--bg-tertiary)]" />
                ))}
              </div>
            </div>
          ))}
        </div>
      }
    />
  )
}
