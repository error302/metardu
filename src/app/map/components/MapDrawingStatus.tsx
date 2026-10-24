'use client'
import type { useSavedProjectDrawing } from '../hooks/useSavedProjectDrawing'
type State=ReturnType<typeof useSavedProjectDrawing>
export function MapDrawingStatus({drawing}:{drawing:State}) {
  return <details open={drawing.error||drawing.cacheWarning?true:undefined}
    style={{left:56,bottom:'calc(var(--map-bottom-clearance,0px) + 112px)',maxWidth:'min(calc(100% - 8rem),28rem)',maxHeight:'max(4rem,calc(100% - var(--map-bottom-clearance,0px) - 17rem))',overflowY:'auto'}}
    className="absolute z-20 rounded-xl border border-[var(--border-color)] bg-[var(--bg-secondary)] p-3 text-sm text-[var(--text-primary)] shadow-lg">
    <summary className="cursor-pointer font-medium">Project drawing · {drawing.loading?'loading':drawing.saving?'saving':drawing.error?'needs review':drawing.dirty?'local edits':`${drawing.snapshot?.features.features.length??0} saved features`}</summary>
    <div className="mt-3 space-y-3">
      <p className="text-xs text-[var(--text-secondary)]">Map drawings are unverified. Grid metrics sum independent features, including hole boundaries; overlapping separate features are counted separately.</p>
      {drawing.error&&<p role="alert" className="text-[var(--error)]">{drawing.error}</p>}
      {drawing.notice&&<p role="status">{drawing.notice}</p>}
      {drawing.cacheWarning&&<p role="alert" className="text-amber-500">{drawing.cacheWarning}</p>}
      {drawing.snapshot?.metrics.status==='unavailable'&&<p>{drawing.snapshot.metrics.reason}</p>}
      <div className="flex flex-wrap gap-3">
        <button disabled={drawing.loading||drawing.saving||!drawing.snapshot} onClick={()=>void drawing.save()} className="font-medium underline disabled:opacity-50">Save drawing</button>
        <button disabled={drawing.loading||drawing.saving} onClick={drawing.snapshot?drawing.reload:drawing.retry} className="underline disabled:opacity-50">{drawing.snapshot?'Reload saved drawing':'Retry loading drawing'}</button>
        <button onClick={drawing.downloadLocal} className="underline">Download local drawing</button>
        {drawing.originalUrl&&<a href={drawing.originalUrl} download className="underline">Download saved original</a>}
        {drawing.snapshot&&<button onClick={drawing.downloadRecovery} className="underline">Download browser recovery</button>}
        {drawing.retained&&<button onClick={drawing.mergeRetained} className="underline">Merge retained draft for review</button>}
      </div>
    </div>
  </details>
}
