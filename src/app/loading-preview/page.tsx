'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import { AsciiCanvas } from '@/components/ascii/AsciiCanvas'
import {
  AD_ASCII_RECIPE,
  CADASTRAL_CONTOUR_RECIPE,
  GEODETIC_MATRIX_RECIPE,
  SURVEYOR_CROSS_RECIPE,
  ELEVATION_VOXEL_RECIPE,
  type AsciiRecipeConfig,
  type RenderMode,
  type AnimStyle,
} from '@/components/ascii/types'
import { ArrowLeft, Sparkles, Sliders, RotateCcw } from 'lucide-react'
import GeomaticsIcon from '@/components/icons/GeomaticsIcon'

const ALL_RENDER_MODES: RenderMode[] = [
  'stars',
  'characters',
  'contour',
  'matrix',
  'cross',
  'voxel',
  'dots',
  'diamond',
  'hexagons',
  'triangles',
  'braille',
  'lego',
  'dither',
  'mosaic',
  'pixel',
  'lines',
  'diagonal',
  'bubbles',
  'hatch',
  'halfblocks',
  'rings',
  'hearts',
  'disco',
  'hexdump',
  'mixed',
]

const ALL_ANIM_STYLES: AnimStyle[] = ['wave', 'pulse', 'shimmer', 'ripple', 'flicker']

export default function LoadingPreviewStudio() {
  const [config, setConfig] = useState<AsciiRecipeConfig>(AD_ASCII_RECIPE)
  const [activePresetName, setActivePresetName] = useState('ad (Stars)')
  const [controlsOpen, setControlsOpen] = useState(true)

  const loadPreset = (name: string, preset: AsciiRecipeConfig) => {
    setActivePresetName(name)
    setConfig({ ...preset })
  }

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-black text-gray-100 font-sans select-none">
      {/* ── Background ASCII Canvas ── */}
      <div className="absolute inset-0 z-0">
        <AsciiCanvas config={config} />
      </div>

      {/* ── Top Bar: Navigation & Presets ── */}
      <div className="absolute top-4 left-4 right-4 z-20 flex items-center justify-between pointer-events-none flex-wrap gap-2">
        <div className="flex items-center gap-2 pointer-events-auto">
          <Link
            href="/"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/60 border border-white/15 text-xs font-medium text-gray-300 hover:text-white backdrop-blur-xl transition-all"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to METARDU
          </Link>
          <span className="px-3 py-1 rounded-full bg-[color-mix(in_srgb,var(--accent)_16%,transparent)] border border-[color-mix(in_srgb,var(--accent)_40%,transparent)] text-[11px] font-mono text-[var(--accent)]">
            21st.dev Engine Studio
          </span>
        </div>

        {/* Quick Presets */}
        <div className="flex items-center gap-1.5 pointer-events-auto bg-black/70 border border-white/15 p-1 rounded-full backdrop-blur-xl">
          <button
            onClick={() => loadPreset('ad (Stars)', AD_ASCII_RECIPE)}
            className={`px-3 py-1 rounded-full text-xs transition-all ${
              activePresetName === 'ad (Stars)'
                ? 'bg-[var(--accent)] text-black font-medium shadow-md'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            <Sparkles className="mr-1 inline h-3.5 w-3.5" aria-hidden="true" /> ad (Stars)
          </button>
          <button
            onClick={() => loadPreset('Contour', CADASTRAL_CONTOUR_RECIPE)}
            className={`px-3 py-1 rounded-full text-xs transition-all ${
              activePresetName === 'Contour'
                ? 'bg-amber-600 text-white font-medium shadow-md'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            <GeomaticsIcon symbol="terrain" className="mr-1 inline h-3.5 w-3.5" /> Cadastral Contour
          </button>
          <button
            onClick={() => loadPreset('Matrix', GEODETIC_MATRIX_RECIPE)}
            className={`px-3 py-1 rounded-full text-xs transition-all ${
              activePresetName === 'Matrix'
                ? 'bg-[var(--accent)] text-black font-medium shadow-md'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            <GeomaticsIcon symbol="control-point" className="mr-1 inline h-3.5 w-3.5" /> Geodetic Matrix
          </button>
          <button
            onClick={() => loadPreset('Cross', SURVEYOR_CROSS_RECIPE)}
            className={`px-3 py-1 rounded-full text-xs transition-all ${
              activePresetName === 'Cross'
                ? 'bg-rose-600 text-white font-medium shadow-md'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            <GeomaticsIcon symbol="traverse" className="mr-1 inline h-3.5 w-3.5" /> Surveyor Cross
          </button>
          <button
            onClick={() => loadPreset('Voxel', ELEVATION_VOXEL_RECIPE)}
            className={`px-3 py-1 rounded-full text-xs transition-all ${
              activePresetName === 'Voxel'
                ? 'bg-[var(--accent)] text-black font-medium shadow-md'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            <GeomaticsIcon symbol="terrain" className="mr-1 inline h-3.5 w-3.5" /> Elevation Voxel
          </button>
        </div>

        <button
          onClick={() => setControlsOpen(!controlsOpen)}
          className="pointer-events-auto flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/60 border border-white/15 text-xs text-gray-300 hover:text-white backdrop-blur-xl transition-all"
        >
          <Sliders className="w-3.5 h-3.5" />
          {controlsOpen ? 'Hide Controls' : 'Show Controls'}
        </button>
      </div>

      {/* ── Floating Controls Sidebar ── */}
      {controlsOpen && (
        <div className="absolute right-4 top-20 bottom-4 w-80 z-20 overflow-y-auto p-4 rounded-2xl bg-black/80 border border-white/15 backdrop-blur-2xl shadow-2xl flex flex-col gap-5 text-xs">
          <div className="flex items-center justify-between border-b border-white/10 pb-2">
            <span className="font-semibold text-gray-200 uppercase tracking-wider text-[11px]">
              Raster Pipeline Controls
            </span>
            <button
              onClick={() => loadPreset('ad (Stars)', AD_ASCII_RECIPE)}
              className="text-gray-400 hover:text-white text-[10px] flex items-center gap-1"
            >
              <RotateCcw className="w-3 h-3" /> Reset
            </button>
          </div>

          {/* Render Mode Grid */}
          <div className="flex flex-col gap-1.5">
            <label className="text-gray-400 font-mono text-[10px] uppercase">
              Render Mode ({config.renderMode})
            </label>
            <div className="grid grid-cols-3 gap-1 max-h-40 overflow-y-auto p-1 bg-white/5 rounded-lg border border-white/10">
              {ALL_RENDER_MODES.map(m => (
                <button
                  key={m}
                  onClick={() => setConfig(prev => ({ ...prev, renderMode: m }))}
                  className={`px-1.5 py-1 rounded text-[10px] truncate capitalize transition-all ${
                    config.renderMode === m
                      ? 'bg-[var(--accent)] text-black font-bold'
                      : 'text-gray-400 hover:text-white hover:bg-white/10'
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>

          {/* Cell Size */}
          <div className="flex flex-col gap-1">
            <div className="flex justify-between text-gray-300">
              <span>Cell Size</span>
              <span className="font-mono text-[var(--accent)]">{config.cellSize}px</span>
            </div>
            <input
              type="range"
              min={8}
              max={36}
              value={config.cellSize}
              onChange={e =>
                setConfig(prev => ({ ...prev, cellSize: parseInt(e.target.value) || 16 }))
              }
              className="accent-[var(--accent)]"
            />
          </div>

          {/* Animation Style */}
          <div className="flex flex-col gap-1.5">
            <label className="text-gray-400 font-mono text-[10px] uppercase">
              Animation Style ({config.animStyle})
            </label>
            <div className="grid grid-cols-3 gap-1">
              {ALL_ANIM_STYLES.map(s => (
                <button
                  key={s}
                  onClick={() => setConfig(prev => ({ ...prev, animStyle: s }))}
                  className={`px-2 py-1 rounded text-[10px] capitalize transition-all ${
                    config.animStyle === s
                      ? 'bg-[var(--accent)] text-black font-bold'
                      : 'bg-white/5 text-gray-400 hover:text-white'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* Contrast & Brightness */}
          <div className="flex flex-col gap-3 border-t border-white/10 pt-3">
            <div className="flex flex-col gap-1">
              <div className="flex justify-between text-gray-300">
                <span>Contrast</span>
                <span className="font-mono">{config.contrast}%</span>
              </div>
              <input
                type="range"
                min={50}
                max={200}
                value={config.contrast}
                onChange={e =>
                  setConfig(prev => ({ ...prev, contrast: parseInt(e.target.value) || 100 }))
                }
                className="accent-[var(--accent)]"
              />
            </div>

            <div className="flex flex-col gap-1">
              <div className="flex justify-between text-gray-300">
                <span>Brightness</span>
                <span className="font-mono">{config.brightness}</span>
              </div>
              <input
                type="range"
                min={-50}
                max={50}
                value={config.brightness}
                onChange={e =>
                  setConfig(prev => ({ ...prev, brightness: parseInt(e.target.value) || 0 }))
                }
                className="accent-[var(--accent)]"
              />
            </div>
          </div>

          {/* Post-Effects Toggles */}
          <div className="flex flex-col gap-2 border-t border-white/10 pt-3">
            <span className="font-semibold text-gray-300 uppercase text-[10px]">
              Post-Effects (PFX)
            </span>

            {/* Bloom */}
            <div className="flex items-center justify-between">
              <span className="text-gray-300">Bloom Glow</span>
              <input
                type="checkbox"
                checked={config.pfx.bloom?.enabled}
                onChange={e =>
                  setConfig(prev => ({
                    ...prev,
                    pfx: {
                      ...prev.pfx,
                      bloom: { ...prev.pfx.bloom, enabled: e.target.checked },
                    },
                  }))
                }
              />
            </div>

            {/* Scanlines */}
            <div className="flex items-center justify-between">
              <span className="text-gray-300">CRT Scanlines</span>
              <input
                type="checkbox"
                checked={config.pfx.scanLines?.enabled}
                onChange={e =>
                  setConfig(prev => ({
                    ...prev,
                    pfx: {
                      ...prev.pfx,
                      scanLines: { ...prev.pfx.scanLines, enabled: e.target.checked },
                    },
                  }))
                }
              />
            </div>

            {/* Vignette */}
            <div className="flex items-center justify-between">
              <span className="text-gray-300">Vignette Shadow</span>
              <input
                type="checkbox"
                checked={config.pfx.vignette?.enabled}
                onChange={e =>
                  setConfig(prev => ({
                    ...prev,
                    pfx: {
                      ...prev.pfx,
                      vignette: { ...prev.pfx.vignette, enabled: e.target.checked },
                    },
                  }))
                }
              />
            </div>

            {/* Film Grain */}
            <div className="flex items-center justify-between">
              <span className="text-gray-300">Film Grain</span>
              <input
                type="checkbox"
                checked={config.pfx.filmGrain?.enabled}
                onChange={e =>
                  setConfig(prev => ({
                    ...prev,
                    pfx: {
                      ...prev.pfx,
                      filmGrain: { ...prev.pfx.filmGrain, enabled: e.target.checked },
                    },
                  }))
                }
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
