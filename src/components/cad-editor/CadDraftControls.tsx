import type { FormEvent } from 'react'
import { cadLineStyles, cadStrokeDash, type CadLineStyle } from '@/lib/cad/cadDraftGeometry'
import { parseCadGridCoordinate } from '@/lib/cad/cadDocumentValidation'
import type { CADAnnotation, CADBackgroundImage } from './CADEditor'

export function CadDraftShape({ shape, selected = false }: { shape: CADAnnotation; selected?: boolean }) {
  const dx = (shape.x2 ?? shape.x) - shape.x
  const dy = (shape.y2 ?? shape.y) - shape.y
  const color = shape.color ?? '#1e293b'
  const stroke = {
    fill: 'none', stroke: selected ? '#2563eb' : color, strokeWidth: selected ? 2.5 : 1.5,
    strokeDasharray: cadStrokeDash[shape.lineStyle ?? 'solid'],
    'data-cad-export-stroke': color, 'data-cad-export-stroke-width': 1.5,
  }
  if (shape.type === 'rectangle') return <rect {...stroke} x={Math.min(0, dx)} y={Math.min(0, dy)} width={Math.abs(dx)} height={Math.abs(dy)} />
  if (shape.type === 'circle') return <circle {...stroke} r={Math.hypot(dx, dy)} />
  return <line {...stroke} x1={0} y1={0} x2={dx} y2={dy} />
}

export function CadLineStyleControl({ value, onChange }: { value: CadLineStyle; onChange: (style: CadLineStyle) => void }) {
  return <label className="block text-xs">Draft line style
    <select value={value} className="mt-1 min-h-10 w-full rounded border border-gray-800 bg-gray-900 px-2 capitalize" onChange={event => {
      const style = cadLineStyles.find(option => option === event.currentTarget.value)
      if (style) onChange(style)
    }}>
      {cadLineStyles.map(style => <option key={style} value={style}>{style}</option>)}
    </select>
  </label>
}

export function CadCopyControls({ referenced, onCopy, onError }: {
  referenced: boolean
  onCopy: (x: number, y: number) => void
  onError: (message: string) => void
}) {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const x = parseCadGridCoordinate(String(data.get('x')))
    const y = parseCadGridCoordinate(String(data.get('y')))
    if (x === undefined || y === undefined) {
      onError('Enter both copy offsets as complete decimal numbers.')
      return
    }
    onCopy(x, y)
  }
  return <form onSubmit={submit} className="space-y-2 border-t border-gray-800 pt-2">
    <div className="grid grid-cols-2 gap-2">
      <label className="min-w-0 text-xs">{referenced ? 'East offset (m)' : 'Right offset (canvas units)'}
        <input required name="x" inputMode="decimal" className="input mt-1 min-h-10 w-full text-xs" />
      </label>
      <label className="min-w-0 text-xs">{referenced ? 'North offset (m)' : 'Down offset (canvas units)'}
        <input required name="y" inputMode="decimal" className="input mt-1 min-h-10 w-full text-xs" />
      </label>
    </div>
    <button type="submit" className="btn btn-secondary min-h-10 w-full text-xs">Copy as draft geometry</button>
  </form>
}

export function CadRasterRotation({ image, onRotate, onFit, onError }: {
  image: CADBackgroundImage
  onRotate: (angle: number) => void
  onFit: () => void
  onError: (message: string) => void
}) {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const angle = parseCadGridCoordinate(String(new FormData(event.currentTarget).get('angle')))
    if (angle === undefined) { onError('Enter a finite image rotation in degrees.'); return }
    onRotate(angle)
  }
  return <div className="space-y-2">
    <form onSubmit={submit} className="flex items-end gap-2">
      <label className="min-w-0 flex-1 text-xs">Image rotation (degrees)
        <input key={image.rotation} required name="angle" inputMode="decimal" defaultValue={image.rotation} disabled={image.locked} className="input mt-1 min-h-10 w-full text-xs" />
      </label>
      <button type="submit" disabled={image.locked} className="btn btn-secondary min-h-10 text-xs">Apply</button>
    </form>
    <div className="grid grid-cols-3 gap-1">
      <button type="button" disabled={image.locked} onClick={() => onRotate(image.rotation - 90)} className="btn btn-secondary min-h-10 text-xs">Left 90°</button>
      <button type="button" disabled={image.locked} onClick={() => onRotate(image.rotation + 90)} className="btn btn-secondary min-h-10 text-xs">Right 90°</button>
      <button type="button" onClick={onFit} className="btn btn-secondary min-h-10 text-xs">Fit image</button>
    </div>
  </div>
}
