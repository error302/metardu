import type Feature from 'ol/Feature'

const fields = [
  { key: 'name', label: 'Point name', maxLength: 120 },
  { key: 'code', label: 'Code', maxLength: 40 },
  { key: 'description', label: 'Description', maxLength: 500 },
  { key: 'elevation', label: 'Reference elevation (m)', maxLength: 40 },
] as const

type PointDetails = Record<(typeof fields)[number]['key'], string>

export interface SketchPointEditor {
  values: PointDetails
  save: (values: PointDetails) => void
}

export function readSketchPointDetails(feature: Feature): PointDetails {
  const name: unknown = feature.get('name') ?? feature.get('label') ?? feature.get('pointName')
  const code: unknown = feature.get('code')
  const description: unknown = feature.get('description')
  const elevation: unknown = feature.get('elevation')
  return {
    name: typeof name === 'string' ? name : '',
    code: typeof code === 'string' ? code : '',
    description: typeof description === 'string' ? description : '',
    elevation: typeof elevation === 'number' && Number.isFinite(elevation) ? String(elevation) : '',
  }
}

export function updateSketchPointDetails(feature: Feature, values: PointDetails) {
  const current = readSketchPointDetails(feature)
  const updates: Record<string, string | number | null> = {}
  for (const { key } of fields) {
    if (values[key] === current[key]) continue
    const value = values[key].trim()
    if (value === current[key]) continue
    if (key === 'elevation') {
      const elevation = value === '' ? null : Number(value)
      if (elevation !== null && (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value) || !Number.isFinite(elevation))) {
        throw new Error('Enter a finite decimal elevation or leave it blank.')
      }
      updates.elevation = elevation
    } else updates[key] = value
  }
  if (!Object.keys(updates).length) return false
  if (typeof updates.name === 'string') updates.label = updates.name
  feature.setProperties(updates, true)
  feature.changed()
  return true
}

export function renderSketchPointEditor(editor: SketchPointEditor, onSaved: () => void) {
  const form = document.createElement('form')
  form.className = 'space-y-2'
  form.setAttribute('aria-label', 'Sketch point details')
  const inputs = fields.map(({ key, label, maxLength }) => {
    const field = document.createElement('label')
    field.className = 'block text-xs text-[var(--text-secondary)]'
    field.textContent = label
    const input = document.createElement(key === 'description' ? 'textarea' : 'input')
    input.className = 'input mt-1 w-full min-h-9 text-xs'
    input.value = editor.values[key]
    input.maxLength = maxLength
    if (key === 'elevation') input.inputMode = 'decimal'
    if (input instanceof HTMLTextAreaElement) input.rows = 2
    field.append(input)
    form.append(field)
    return input
  })

  const note = document.createElement('p')
  note.textContent = 'Details are saved with the sketch. Use Modify Vertices to move the point.'
  note.className = 'text-[11px] text-[var(--text-secondary)]'
  const error = document.createElement('p')
  error.setAttribute('role', 'alert')
  error.className = 'text-xs text-[var(--error)]'
  const save = document.createElement('button')
  save.type = 'submit'
  save.className = 'btn btn-secondary min-h-10 w-full text-xs'
  save.textContent = 'Save point details'
  form.append(note, error, save)
  form.addEventListener('submit', event => {
    event.preventDefault()
    try {
      const [name, code, description, elevation] = inputs.map(input => input.value)
      editor.save({ name, code, description, elevation })
      onSaved()
    } catch (reason) {
      error.textContent = reason instanceof Error ? reason.message : 'Could not save the point details.'
    }
  })
  return form
}
