import { render, screen } from '@testing-library/react'
import { FixVerdictBadge } from '../FixVerdictBadge'
import { assessFieldFix } from '@/lib/field/fixVerdict'

describe('FixVerdictBadge', () => {
  it('shows survey grade for a sound RTK Fixed reading', () => {
    render(<FixVerdictBadge assessment={assessFieldFix({ source: 'nmea', quality: 4, hdop: 0.8, satellites: 14 })} />)
    expect(screen.getByRole('status')).toHaveAccessibleName('Fix quality: RTK Fixed, Survey grade')
    expect(screen.getByText('RTK Fixed · HDOP 0.8 · 14 sats')).toBeInTheDocument()
  })

  it('keeps an autonomous GPS warning visible before capture', () => {
    render(<FixVerdictBadge assessment={assessFieldFix({ source: 'nmea', quality: 1, hdop: 3.4, satellites: 5 })} />)
    expect(screen.getByText('Autonomous GPS')).toBeInTheDocument()
    expect(screen.getByText('Not usable')).toBeInTheDocument()
    expect(screen.getByText(/Autonomous GPS positions are metres out/)).toBeInTheDocument()
  })
})
