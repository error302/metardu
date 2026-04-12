import { CalculatorErrorBoundary } from '@/components/CalculatorErrorBoundary'
import type { ReactNode } from 'react'

export default function ToolsLayout({ children }: { children: ReactNode }) {
  return (
    <CalculatorErrorBoundary>
      {children}
    </CalculatorErrorBoundary>
  )
}
