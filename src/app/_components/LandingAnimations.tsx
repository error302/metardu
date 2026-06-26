'use client';

/**
 * Landing page animations — extracted from app/page.tsx so the parent can be
 * a server component. These are pure visual decoration (animated background
 * orbs + a scroll-reveal connecting line) and use framer-motion's <motion.*>
 * which is client-only.
 *
 * ponytail: extracting 3 motion.div usages keeps the 800-LOC landing page as
 * RSC. CounterAnimation and TypewriterText are already in MotionComponents.tsx
 * ('use client') so the parent can import them directly.
 */

import { motion } from 'framer-motion'

// ─── Animated background orbs (decorative) ──────────────────────────────────

export function AnimatedOrbs() {
  return (
    <>
      <motion.div
        className="absolute top-1/4 left-1/4 w-[500px] h-[500px] rounded-full opacity-20 blur-[120px]"
        style={{ background: 'radial-gradient(circle, rgba(232,132,26,0.15), transparent 70%)' }}
        animate={{
          x: [0, 40, -20, 0],
          y: [0, -30, 20, 0],
        }}
        transition={{ duration: 20, repeat: Infinity, ease: 'linear' }}
      />
      <motion.div
        className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] rounded-full opacity-15 blur-[100px]"
        style={{ background: 'radial-gradient(circle, rgba(232,132,26,0.12), transparent 70%)' }}
        animate={{
          x: [0, -30, 20, 0],
          y: [0, 20, -40, 0],
        }}
        transition={{ duration: 25, repeat: Infinity, ease: 'linear' }}
      />
    </>
  )
}

// ─── Scroll-reveal connecting line (decorative) ─────────────────────────────

export function ConnectingLine() {
  return (
    <motion.div
      className="h-full bg-gradient-to-r from-[var(--accent)]/0 via-[var(--accent)]/30 to-[var(--accent)]/0"
      initial={{ scaleX: 0 }}
      whileInView={{ scaleX: 1 }}
      viewport={{ once: true }}
      transition={{ duration: 1, delay: 0.5 }}
      style={{ transformOrigin: 'left' }}
    />
  )
}
