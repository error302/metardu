import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import { cadWheelDeltaPixels, cadWheelZoom, zoomCadAt } from '@/lib/cad/cadViewport'

const initialView = { zoom: 1, pan: { x: 0, y: 0 } }

export function useCadCamera(
  viewportRef: RefObject<HTMLDivElement>,
  initialSize: { width: number; height: number },
  isDragging: () => boolean,
) {
  const [view, setRenderedView] = useState(initialView)
  const [viewportSize, setViewportSize] = useState(() => ({ width: initialSize.width, height: initialSize.height }))
  const current = useRef(initialView)
  const panFrame = useRef(0)

  const setView = useCallback((next: typeof initialView) => {
    current.current = next
    setRenderedView(next)
  }, [])

  const panTo = useCallback((pan: typeof initialView.pan) => {
    current.current = { ...current.current, pan }
    if (!panFrame.current) {
      panFrame.current = requestAnimationFrame(() => {
        panFrame.current = 0
        setRenderedView(current.current)
      })
    }
  }, [])

  const panBy = useCallback((x: number, y: number) => {
    const { pan } = current.current
    panTo({ x: pan.x + x, y: pan.y + y })
  }, [panTo])

  const zoomBy = useCallback((factor: number) => {
    const { zoom, pan } = current.current
    setView(zoomCadAt(zoom, pan, zoom * factor, { x: viewportSize.width / 2, y: viewportSize.height / 2 }, viewportSize))
  }, [setView, viewportSize])

  useEffect(() => {
    const element = viewportRef.current
    if (!element) return
    const updateSize = () => {
      const { width, height } = element.getBoundingClientRect()
      if (width > 0 && height > 0) {
        setViewportSize(old => old.width === width && old.height === height ? old : { width, height })
      }
    }
    updateSize()
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(updateSize)
    observer?.observe(element)

    let wheelFrame = 0
    let delta = 0
    let pointer = { x: 0, y: 0 }
    function wheel(event: WheelEvent) {
      if (event.cancelable) event.preventDefault()
      if (isDragging()) return
      const mode = event.deltaMode
      const pixels = cadWheelDeltaPixels(event.deltaY, mode, element?.clientHeight || 400)
      if (!pixels) return
      delta += pixels
      pointer = { x: event.clientX, y: event.clientY }
      if (wheelFrame) return
      wheelFrame = requestAnimationFrame(() => {
        wheelFrame = 0
        const change = delta
        delta = 0
        if (isDragging()) return
        const rect = element?.getBoundingClientRect()
        if (!rect?.width || !rect.height) return
        const { zoom, pan } = current.current
        setView(zoomCadAt(zoom, pan, cadWheelZoom(zoom, change),
          { x: pointer.x - rect.left, y: pointer.y - rect.top }, rect))
      })
    }

    element.addEventListener('wheel', wheel, { passive: false })
    return () => {
      observer?.disconnect()
      element.removeEventListener('wheel', wheel)
      if (wheelFrame) cancelAnimationFrame(wheelFrame)
      if (panFrame.current) cancelAnimationFrame(panFrame.current)
      panFrame.current = 0
    }
  }, [isDragging, setView, viewportRef])

  return { ...view, viewportSize, current, setView, panTo, panBy, zoomBy }
}
