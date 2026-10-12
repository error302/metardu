'use client'

import React, { useEffect, useRef } from 'react'
import { AsciiRasterEngine } from './AsciiRasterEngine'
import { AD_ASCII_RECIPE, type AsciiRecipeConfig } from './types'

export interface AsciiCanvasProps {
  config?: AsciiRecipeConfig
  className?: string
  style?: React.CSSProperties
  fps?: number
  ariaHidden?: boolean
}

export function AsciiCanvas({
  config = AD_ASCII_RECIPE,
  className = '',
  style = {},
  fps = 60,
  ariaHidden = true,
}: AsciiCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const engineRef = useRef<AsciiRasterEngine | null>(null)
  const animFrameId = useRef<number | null>(null)
  const lastTimeRef = useRef<number>(0)
  const intervalMs = 1000 / fps

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    if (!engineRef.current) {
      engineRef.current = new AsciiRasterEngine()
    }
    const engine = engineRef.current

    let isVisible = !document.hidden
    const handleVisibility = () => {
      isVisible = !document.hidden
    }
    document.addEventListener('visibilitychange', handleVisibility)

    // Handle high DPI and container resize
    const updateSize = () => {
      if (!canvas) return
      const rect = canvas.getBoundingClientRect()
      const dpr = Math.min(window.devicePixelRatio || 1, 2) // Cap at 2 for performance
      const w = Math.floor(rect.width * dpr) || 300
      const h = Math.floor(rect.height * dpr) || 150

      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w
        canvas.height = h
      }
    }

    updateSize()
    const ro = new ResizeObserver(() => {
      updateSize()
    })
    ro.observe(canvas)

    // Animation Loop
    let running = true
    const loop = (now: number) => {
      if (!running) return

      const delta = now - lastTimeRef.current
      if (delta >= intervalMs && isVisible) {
        lastTimeRef.current = now - (delta % intervalMs)
        try {
          engine.renderFrame(canvas, config, now)
        } catch {
          // Guard against unmounted context errors
        }
      }

      animFrameId.current = requestAnimationFrame(loop)
    }

    animFrameId.current = requestAnimationFrame(loop)

    return () => {
      running = false
      if (animFrameId.current) cancelAnimationFrame(animFrameId.current)
      document.removeEventListener('visibilitychange', handleVisibility)
      ro.disconnect()
    }
  }, [config, intervalMs])

  return (
    <canvas
      ref={canvasRef}
      className={`block w-full h-full ${className}`}
      style={{
        imageRendering: 'auto',
        ...style,
      }}
      aria-hidden={ariaHidden}
    />
  )
}

export default AsciiCanvas
