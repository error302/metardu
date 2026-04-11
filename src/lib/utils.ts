import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

// ---------------------------------------------------------------------------
// className composition
// ---------------------------------------------------------------------------
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// ---------------------------------------------------------------------------
// Framer Motion – animation variants (21st.dev style)
// ---------------------------------------------------------------------------
export const fadeUpVariant = {
  hidden: { opacity: 0, y: 30 },
  visible: (i: number = 0) => ({
    opacity: 1,
    y: 0,
    transition: {
      delay: i * 0.1,
      duration: 0.5,
      ease: [0.25, 0.4, 0.25, 1] as [number, number, number, number],
    },
  }),
}

export const fadeInVariant = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { duration: 0.6 },
  },
}

export const scaleVariant = {
  hidden: { opacity: 0, scale: 0.95 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: { duration: 0.5, ease: [0.25, 0.4, 0.25, 1] as [number, number, number, number] },
  },
}

export const staggerContainer = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.08, delayChildren: 0.1 },
  },
}

export const slideInLeft = {
  hidden: { opacity: 0, x: -40 },
  visible: {
    opacity: 1,
    x: 0,
    transition: { duration: 0.5, ease: [0.25, 0.4, 0.25, 1] as [number, number, number, number] },
  },
}

export const slideInRight = {
  hidden: { opacity: 0, x: 40 },
  visible: {
    opacity: 1,
    x: 0,
    transition: { duration: 0.5, ease: [0.25, 0.4, 0.25, 1] as [number, number, number, number] },
  },
}

// ---------------------------------------------------------------------------
// Spring presets (21st.dev style)
// ---------------------------------------------------------------------------
export const springSmooth = {
  type: "spring" as const,
  stiffness: 300,
  damping: 30,
}

export const springBouncy = {
  type: "spring" as const,
  stiffness: 400,
  damping: 17,
}

export const springGentle = {
  type: "spring" as const,
  stiffness: 200,
  damping: 25,
}
