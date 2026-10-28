'use client'

import React, { useState, useRef, useEffect, useCallback } from 'react'
import { Mic, MicOff, Plus, Minus } from 'lucide-react';

export interface SurveyFeatureCode {
  code: string
  label: string
  category: 'monument' | 'boundary' | 'infrastructure' | 'natural'
  defaultDesc: string
}

export const CADASTRAL_FEATURE_CODES: SurveyFeatureCode[] = [
  { code: 'MB', label: 'Concrete Beacon', category: 'monument', defaultDesc: 'Standard concrete survey beacon (PSC)' },
  { code: 'IP', label: 'Iron Pin', category: 'monument', defaultDesc: 'Iron pin in concrete / rock' },
  { code: 'CP', label: 'Control Point', category: 'monument', defaultDesc: 'Traverse control station / bench mark' },
  { code: 'BS', label: 'Backsight', category: 'monument', defaultDesc: 'Traverse backsight reference station' },
  { code: 'BLD', label: 'Building Corner', category: 'infrastructure', defaultDesc: 'Permanent masonry building corner' },
  { code: 'FNC', label: 'Fence Post', category: 'boundary', defaultDesc: 'Boundary perimeter fence post' },
  { code: 'RD', label: 'Road Edge / CL', category: 'infrastructure', defaultDesc: 'Access road edge / centerline' },
  { code: 'WL', label: 'Wall Corner', category: 'boundary', defaultDesc: 'Stone boundary perimeter wall' },
  { code: 'TR', label: 'Landmark Tree', category: 'natural', defaultDesc: 'Landmark corner tree / boundary hedge' },
  { code: 'MH', label: 'Manhole Cover', category: 'infrastructure', defaultDesc: 'Sewer / utility manhole cover' },
  { code: 'CUL', label: 'Culvert Headwall', category: 'infrastructure', defaultDesc: 'Drainage culvert headwall' },
  { code: 'RIV', label: 'River / Stream', category: 'natural', defaultDesc: 'Riparian reserve boundary / water mark' },
]

interface RapidPointKeypadProps {
  pointName: string
  onPointNameChange: (val: string) => void
  description: string
  onDescriptionChange: (val: string) => void
  onFeatureSelect?: (code: SurveyFeatureCode) => void
  className?: string
}

export function RapidPointKeypad({
  pointName,
  onPointNameChange,
  description,
  onDescriptionChange,
  onFeatureSelect,
  className = '',
}: RapidPointKeypadProps) {
  const [listening, setListening] = useState(false)
  const [selectedCode, setSelectedCode] = useState<string | null>(null)
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)

  useEffect(() => () => {
    const recognition = recognitionRef.current
    recognitionRef.current = null
    if (recognition) {
      recognition.onresult = null
      recognition.onerror = null
      recognition.onend = null
      recognition.abort()
    }
  }, [])

  // Increment point number (e.g. MB-01 -> MB-02 or STN1 -> STN2)
  const handleIncrement = useCallback(() => {
    onPointNameChange(
      pointName.replace(/(\d+)$/, (match) => {
        const num = parseInt(match, 10) + 1
        return String(num).padStart(match.length, '0')
      })
    )
  }, [pointName, onPointNameChange])

  // Decrement point number
  const handleDecrement = useCallback(() => {
    onPointNameChange(
      pointName.replace(/(\d+)$/, (match) => {
        const num = Math.max(1, parseInt(match, 10) - 1)
        return String(num).padStart(match.length, '0')
      })
    )
  }, [pointName, onPointNameChange])

  // Handle Quick Feature Chip Click
  const handleSelectCode = (item: SurveyFeatureCode) => {
    setSelectedCode(item.code)
    // If point name doesn't have a prefix, set prefix + number
    if (!pointName || /^\d+$/.test(pointName)) {
      onPointNameChange(`${item.code}-${pointName || '1'}`)
    } else {
      // replace prefix before hyphen or number
      onPointNameChange(pointName.replace(/^[A-Za-z]+/, item.code))
    }

    // Append or set default description
    onDescriptionChange(item.defaultDesc)
    onFeatureSelect?.(item)
  }

  // Voice Dictation for Remarks
  const toggleVoice = useCallback(() => {
    if (listening) {
      recognitionRef.current?.stop()
      setListening(false)
      return
    }

    const SpeechRecognition =
      window.SpeechRecognition ?? window.webkitSpeechRecognition
    if (!SpeechRecognition) {
      alert('Speech Recognition not supported in this browser. Use Chrome or Edge.')
      return
    }

    try {
      const recognition = new SpeechRecognition()
      recognition.continuous = false
      recognition.interimResults = false
      recognition.lang = 'en-KE' // Kenyan English / East Africa

      recognition.onresult = (e: SpeechRecognitionEventLike) => {
        const transcript = e.results[0]?.[0]?.transcript
        if (typeof transcript === 'string' && transcript.trim()) {
          onDescriptionChange(description ? `${description} ${transcript}` : transcript)
        }
        setListening(false)
      }

      recognition.onerror = () => setListening(false)
      recognition.onend = () => setListening(false)

      recognition.start()
      recognitionRef.current = recognition
      setListening(true)
    } catch {
      setListening(false)
    }
  }, [listening, description, onDescriptionChange])

  return (
    <div className={`p-3 rounded-2xl border border-[var(--border-color,#3f3f46)] bg-[var(--bg-secondary,#18181b)] space-y-3 ${className}`}>
      {/* Top Header: Point Name Stepper + Mic */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 flex-1">
          <div className="flex items-center rounded-xl border border-[var(--border-color,#3f3f46)] bg-black/20 overflow-hidden w-full max-w-[200px]">
            <span className="px-2 text-[10px] uppercase font-bold text-zinc-400 select-none">PT</span>
            <input
              type="text"
              value={pointName}
              onChange={(e) => onPointNameChange(e.target.value)}
              placeholder="e.g. MB-01"
              className="w-full bg-transparent py-1.5 px-1 text-xs font-mono font-bold text-[var(--text-primary,#ffffff)] focus:outline-none"
            />
            <div className="flex border-l border-[var(--border-color,#3f3f46)]">
              <button
                type="button"
                onClick={handleDecrement}
                className="px-2 py-1 text-zinc-400 hover:text-white hover:bg-white/10 text-xs"
                title="Decrement point number"
              >
                <Minus className="w-3 h-3" />
              </button>
              <button
                type="button"
                onClick={handleIncrement}
                className="px-2 py-1 text-amber-400 hover:text-amber-300 hover:bg-white/10 text-xs font-bold"
                title="Increment point number (+1)"
              >
                <Plus className="w-3 h-3" />
              </button>
            </div>
          </div>
        </div>

        {/* Voice Dictation Button */}
        <button
          type="button"
          onClick={toggleVoice}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all shadow-sm ${
            listening
              ? 'bg-red-500 text-white animate-pulse ring-2 ring-red-400'
              : 'bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 border border-amber-500/30'
          }`}
          title="Voice dictate point description (hands-free on rover pole)"
        >
          {listening ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
          <span>{listening ? 'Listening...' : 'Voice Note'}</span>
        </button>
      </div>

      {/* Description input with clear button */}
      <div className="relative">
        <input
          type="text"
          value={description}
          onChange={(e) => onDescriptionChange(e.target.value)}
          placeholder="Tap code below or speak note..."
          className="w-full rounded-xl border border-[var(--border-color,#3f3f46)] bg-black/20 px-3 py-1.5 text-xs text-[var(--text-primary,#ffffff)] focus:outline-none focus:border-amber-500 pr-8"
        />
        {description && (
          <button
            type="button"
            onClick={() => onDescriptionChange('')}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white text-xs"
          >
            ×
          </button>
        )}
      </div>

      {/* 1-Tap Quick Feature Codes Keypad */}
      <div>
        <div className="flex items-center justify-between text-[10px] text-zinc-400 mb-1.5 px-0.5">
          <span className="uppercase tracking-wider font-semibold">1-Tap Feature Code Keypad</span>
          <span className="text-[9px] text-amber-400">One-handed rover mode</span>
        </div>

        <div className="grid grid-cols-4 sm:grid-cols-6 gap-1.5">
          {CADASTRAL_FEATURE_CODES.map((item) => {
            const isSelected = selectedCode === item.code || pointName.startsWith(item.code)
            return (
              <button
                key={item.code}
                type="button"
                onClick={() => handleSelectCode(item)}
                className={`py-2 px-1 rounded-xl text-center transition-all border ${
                  isSelected
                    ? 'border-amber-500 bg-amber-500 text-black font-extrabold shadow-sm'
                    : 'border-[var(--border-color,#27272a)] bg-black/40 text-zinc-200 hover:border-amber-500/50 hover:bg-white/5 font-semibold'
                }`}
              >
                <div className="text-xs font-mono">{item.code}</div>
                <div className={`text-[9px] truncate ${isSelected ? 'text-black/80' : 'text-zinc-400'}`}>
                  {item.label.split(' ')[0]}
                </div>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
