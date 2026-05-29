'use client';

import { useEffect } from 'react'

// ─── Global Styles Injector ──────────────────────────────────────────────
// Injects OpenLayers and custom scrollbar styles via a <style> element.
// This replaces styled-jsx which doesn't work reliably inside components
// loaded via next/dynamic with ssr:false.

export default function MapGlobalStyles() {
  useEffect(() => {
    const id = 'metardu-map-global-styles'
    if (document.getElementById(id)) return // prevent duplicates

    const style = document.createElement('style')
    style.id = id
    style.textContent = `
      .ol-mouse-position {
        display: none !important;
      }
      .ol-overviewmap {
        bottom: 50px !important;
        left: 50% !important;
        right: auto !important;
        transform: translateX(-50%);
        border: 1px solid rgba(232,132,26,0.3) !important;
        border-radius: 10px !important;
        overflow: hidden !important;
        background: rgba(13,13,20,0.95) !important;
      }
      .ol-overviewmap .ol-overviewmap-map {
        border: none !important;
      }
      .ol-overviewmap button {
        background: rgba(13,13,20,0.9) !important;
        color: #E8841A !important;
        border-radius: 6px !important;
      }
      .ol-zoomslider {
        background: rgba(13,13,20,0.9) !important;
        border: 1px solid rgba(255,255,255,0.06) !important;
        border-radius: 10px !important;
        left: auto !important;
        right: 8px !important;
        top: 50% !important;
        transform: translateY(-50%);
        height: 120px !important;
      }
      .ol-zoomslider:hover {
        background: rgba(13,13,20,1) !important;
      }
      .ol-zoomslider .ol-zoomslider-thumb {
        background: #E8841A !important;
        border-radius: 6px !important;
        border: none !important;
      }
      .ol-zoomslider .ol-zoomslider-range {
        background: rgba(232,132,26,0.2) !important;
      }
      .ol-scale-line {
        display: none !important;
      }
      .ol-control button {
        background: rgba(13,13,20,0.9) !important;
        color: #9ca3af !important;
        border-radius: 8px !important;
        border: 1px solid rgba(255,255,255,0.06) !important;
      }
      .ol-control button:hover {
        background: rgba(13,13,20,1) !important;
        color: #E8841A !important;
      }
      .custom-scrollbar::-webkit-scrollbar {
        width: 3px;
      }
      .custom-scrollbar::-webkit-scrollbar-track {
        background: transparent;
      }
      .custom-scrollbar::-webkit-scrollbar-thumb {
        background: rgba(255,255,255,0.08);
        border-radius: 3px;
      }
      .custom-scrollbar::-webkit-scrollbar-thumb:hover {
        background: rgba(255,255,255,0.15);
      }
    `
    document.head.appendChild(style)

    return () => {
      document.getElementById(id)?.remove()
    }
  }, [])

  return null
}
