'use client';
import { getUTMZoneFromLatLng } from '@/lib/geodesy/utmZones'

interface UTMZonePickerProps {
  value: number | null
  hemisphere: 'N' | 'S' | ''
  onChange: (zone: number | null, hemisphere: 'N' | 'S' | '') => void
}

export default function UTMZonePicker({ 
  value, 
  hemisphere, 
  onChange 
}: UTMZonePickerProps) {
  const commonZones = [
    { zone: 30 }, { zone: 32 }, { zone: 33 }, { zone: 36 },
    { zone: 37 }, { zone: 43 }, { zone: 54 }, { zone: 55 },
  ]

  const detectFromGPS = () => {
    if (!navigator.geolocation) {
      alert('GPS not supported in your browser')
      return
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { zone, hemisphere: h } = getUTMZoneFromLatLng(
          pos.coords.latitude,
          pos.coords.longitude
        )
        onChange(zone, h)
      },
      () => {
        alert('Could not get GPS location')
      }
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-4 items-end">
        <div>
          <label className="block text-sm text-[var(--text-secondary)] mb-1" htmlFor="utm-zone">UTM Zone</label>
          <input id="utm-zone"
            type="number"
            min={1}
            max={60}
            value={value ?? ''}
            onChange={e => onChange(e.target.value === '' ? null : Number(e.target.value), hemisphere)}
            className="w-20 bg-[var(--bg-tertiary)] text-[var(--text-primary)] px-3 py-2 rounded border border-[var(--border-color)] font-mono"
          />
        </div>
        <div>
          <label className="block text-sm text-[var(--text-secondary)] mb-1" htmlFor="hemisphere">Hemisphere</label>
          <select id="hemisphere"
            value={hemisphere}
            onChange={e => onChange(value, e.target.value as 'N' | 'S' | '')}
            className="bg-[var(--bg-tertiary)] text-[var(--text-primary)] px-3 py-2 rounded border border-[var(--border-color)]"
          >
            <option value="">Select hemisphere</option>
            <option value="N">N — Northern</option>
            <option value="S">S — Southern</option>
          </select>
        </div>
        <div className="flex-1">
          <div className="block text-sm text-[var(--text-secondary)] mb-1">Coverage</div>
          <p className="text-amber-500 text-sm">
            {value != null && Number.isInteger(value) && value >= 1 && value <= 60 && hemisphere
              ? `Zone ${value}${hemisphere} — ${(value - 1) * 6 - 180}° to ${value * 6 - 180}°`
              : 'Select a zone and hemisphere'}
          </p>
        </div>
      </div>

      <div>
        <p className="text-[var(--text-muted)] text-xs mb-2">Quick select:</p>
        <div className="flex flex-wrap gap-2">
          {commonZones.map((cz) => (
            <button
              key={cz.zone}
              onClick={() => onChange(cz.zone, hemisphere)}
              className={`text-xs px-2 py-1 rounded border transition ${
                value === cz.zone
                  ? 'bg-amber-500 text-black border-amber-500'
                  : 'bg-[var(--bg-tertiary)] text-[var(--text-primary)] border-[var(--border-color)] hover:border-amber-500'
              }`}
            >
              Zone {cz.zone}
            </button>
          ))}
        </div>
      </div>

      <div className="flex gap-1 overflow-x-auto pb-2">
        {Array.from({ length: 60 }, (_, i) => i + 1).map((zone) => (
          <button
            key={zone}
            aria-label={`UTM zone ${zone}`}
            onClick={() => onChange(zone, hemisphere)}
            className={`flex-none w-6 h-8 text-xs rounded transition ${
              value === zone
                ? 'bg-amber-500 text-black font-bold'
                : 'bg-[var(--bg-tertiary)] text-[var(--text-muted)] hover:bg-[var(--border-hover)]'
            }`}
          >
            {zone % 10 === 0 ? zone : ''}
          </button>
        ))}
      </div>

      <button
        onClick={detectFromGPS}
        className="text-sm text-amber-500 underline"
      >
        Suggest zone from browser location
      </button>
      <p className="text-xs text-[var(--text-muted)]">A location suggestion does not establish the project datum or survey control.</p>
    </div>
  )
}
