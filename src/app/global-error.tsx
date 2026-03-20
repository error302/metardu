"use client"

import { useEffect } from "react"

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error("Global error:", error)
  }, [error])

  return (
    <html lang="en">
      <body style={{ background: "#0a0a0f", color: "#e5e5e5", fontFamily: "system-ui, sans-serif" }}>
        <div style={{ display: "flex", minHeight: "100vh", alignItems: "center", justifyContent: "center", padding: "2rem", textAlign: "center" }}>
          <div>
            <h1 style={{ color: "#E8841A", fontSize: "2rem", fontWeight: "700", marginBottom: "0.5rem" }}>GEONOVA</h1>
            <h2 style={{ fontSize: "1.2rem", marginBottom: "1rem" }}>Something went wrong</h2>
            <p style={{ color: "#a3a3a3", marginBottom: "1.5rem", fontSize: "0.9rem" }}>
              {error.message || "An unexpected error occurred."}
            </p>
            <button
              onClick={reset}
              style={{ background: "#E8841A", color: "#000", border: "none", padding: "0.75rem 2rem", borderRadius: "6px", fontWeight: "600", cursor: "pointer" }}
            >
              Try again
            </button>
          </div>
        </div>
      </body>
    </html>
  )
}
