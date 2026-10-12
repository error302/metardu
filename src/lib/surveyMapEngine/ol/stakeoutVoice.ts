/**
 * stakeoutVoice.ts
 * ────────────────────────────────────────────────────────────────────────────
 * Voice-guided stakeout speech synthesizer for field surveying.
 * Speaks real-time directional cues (distance, cardinal offsets, elevation cut/fill)
 * so the surveyor can keep their eyes on the prism pole, bubble vial, and ground terrain.
 */

import { ARRIVAL_TOLERANCE_M, type StakeoutState } from './stakeout'

export interface StakeoutVoicePromptOptions {
  distance: number
  dE: number
  dN: number
  bearing: number
  elevationDiff: number | null
  arrivalAssessment: StakeoutState['arrivalAssessment']
  enabled?: boolean
  language?: string
}

class StakeoutVoiceEngine {
  private lastSpokenTime = 0
  private minIntervalMs = 3800 // Prevent overlapping speech
  private isSpeaking = false

  public speakGuidance(opts: StakeoutVoicePromptOptions): void {
    if (!opts.enabled) return
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return

    const now = Date.now()
    if (now - this.lastSpokenTime < this.minIntervalMs) return

    // Device geolocation is an approach aid. Never let its proximity cue sound
    // like survey acceptance when its uncertainty overlaps the display band.
    if (opts.arrivalAssessment === 'reported-accuracy-unknown') {
      this.say('Near target, but device accuracy is unknown. Verify with survey GNSS before marking.')
      this.lastSpokenTime = now
      return
    }
    if (opts.arrivalAssessment === 'reported-uncertainty-overlaps-band') {
      this.say(`Near target, but reported uncertainty crosses the ${ARRIVAL_TOLERANCE_M.toFixed(1)} metre navigation band. Verify with survey GNSS before marking.`)
      this.lastSpokenTime = now
      return
    }
    if (opts.arrivalAssessment === 'device-estimate-within-navigation-band') {
      this.say('Device position estimate is within the navigation band. Confirm job tolerance with survey GNSS before marking.')
      this.lastSpokenTime = now
      return
    }

    // 2. Very Close (0.8m - 3m)
    if (opts.distance <= 3) {
      const distStr = opts.distance < 1
        ? `${Math.round(opts.distance * 100)} centimetres`
        : `${opts.distance.toFixed(1)} metres`

      let msg = `Target close, ${distStr}. `

      // Cardinal fine offsets
      if (Math.abs(opts.dN) >= 0.1) {
        msg += opts.dN > 0 ? `North ${opts.dN.toFixed(1)}, ` : `South ${Math.abs(opts.dN).toFixed(1)}, `
      }
      if (Math.abs(opts.dE) >= 0.1) {
        msg += opts.dE > 0 ? `East ${opts.dE.toFixed(1)}` : `West ${Math.abs(opts.dE).toFixed(1)}`
      }

      this.say(msg)
      this.lastSpokenTime = now
      return
    }

    // 3. Approaching (3m - 20m)
    if (opts.distance <= 20) {
      let msg = `${opts.distance.toFixed(0)} metres. `
      if (Math.abs(opts.dN) >= 1) {
        msg += opts.dN > 0 ? `North ${opts.dN.toFixed(0)}, ` : `South ${Math.abs(opts.dN).toFixed(0)}, `
      }
      if (Math.abs(opts.dE) >= 1) {
        msg += opts.dE > 0 ? `East ${opts.dE.toFixed(0)}` : `West ${Math.abs(opts.dE).toFixed(0)}`
      }

      // Elevation Cut/Fill
      if (opts.elevationDiff !== null && Math.abs(opts.elevationDiff) >= 0.1) {
        msg += opts.elevationDiff < 0
          ? `. Cut ${Math.abs(opts.elevationDiff).toFixed(2)}`
          : `. Fill ${opts.elevationDiff.toFixed(2)}`
      }

      this.say(msg)
      this.lastSpokenTime = now
      return
    }

    // 4. Far (> 20m)
    const distM = Math.round(opts.distance)
    this.say(`${distM} metres to target. Bearing ${Math.round(opts.bearing)} degrees.`)
    this.lastSpokenTime = now
  }

  private say(text: string): void {
    try {
      window.speechSynthesis.cancel() // Stop any previous utterance
      const utterance = new SpeechSynthesisUtterance(text)
      utterance.rate = 1.05 // slightly brisk for fieldwork
      utterance.pitch = 1.0
      utterance.volume = 1.0
      utterance.lang = 'en-US'

      utterance.onstart = () => { this.isSpeaking = true }
      utterance.onend = () => { this.isSpeaking = false }
      utterance.onerror = () => { this.isSpeaking = false }

      window.speechSynthesis.speak(utterance)
    } catch {
      // ignore
    }
  }

  public stop(): void {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel()
      this.isSpeaking = false
    }
  }
}

export const stakeoutVoice = new StakeoutVoiceEngine()
