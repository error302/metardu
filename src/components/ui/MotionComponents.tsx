"use client";

import { useEffect, useRef, useState } from "react";
import {
  motion,
  type HTMLMotionProps,
  useInView,
  useMotionValue,
  useSpring,
  useTransform,
  animate,
} from "framer-motion";
import { cn } from "@/lib/utils";
import {
  fadeUpVariant,
  fadeInVariant,
  scaleVariant,
  staggerContainer,
  slideInLeft,
  slideInRight,
  springSmooth,
  springBouncy,
} from "@/lib/utils";

/* ========================================================================
   Shared viewport options – trigger before element is fully in view
   ======================================================================== */
const VIEWPORT = { once: true, margin: "-100px" } as const;

/* ========================================================================
   FadeUp – fade in + slide up on scroll
   ======================================================================== */
export function FadeUp({
  children,
  className,
  delay = 0,
  ...props
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
} & Omit<HTMLMotionProps<"div">, "children">) {
  return (
    <motion.div
      variants={fadeUpVariant}
      custom={delay}
      initial="hidden"
      whileInView="visible"
      viewport={VIEWPORT}
      className={cn(className)}
      {...props}
    >
      {children}
    </motion.div>
  );
}

/* ========================================================================
   FadeIn – simple fade
   ======================================================================== */
export function FadeIn({
  children,
  className,
  delay = 0,
  ...props
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
} & Omit<HTMLMotionProps<"div">, "children">) {
  return (
    <motion.div
      variants={fadeInVariant}
      initial="hidden"
      whileInView="visible"
      viewport={VIEWPORT}
      transition={{ delay }}
      className={cn(className)}
      {...props}
    >
      {children}
    </motion.div>
  );
}

/* ========================================================================
   ScaleIn – scale + fade entrance
   ======================================================================== */
export function ScaleIn({
  children,
  className,
  delay = 0,
  ...props
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
} & Omit<HTMLMotionProps<"div">, "children">) {
  return (
    <motion.div
      variants={scaleVariant}
      initial="hidden"
      whileInView="visible"
      viewport={VIEWPORT}
      transition={{ delay }}
      className={cn(className)}
      {...props}
    >
      {children}
    </motion.div>
  );
}

/* ========================================================================
   StaggerContainer – wraps children with staggered entrance
   ======================================================================== */
export function StaggerContainer({
  children,
  className,
  staggerDelay = 0.08,
  ...props
}: {
  children: React.ReactNode;
  className?: string;
  staggerDelay?: number;
} & Omit<HTMLMotionProps<"div">, "children">) {
  return (
    <motion.div
      variants={{
        hidden: {},
        visible: {
          transition: { staggerChildren: staggerDelay, delayChildren: 0.1 },
        },
      }}
      initial="hidden"
      whileInView="visible"
      viewport={VIEWPORT}
      className={cn(className)}
      {...props}
    >
      {children}
    </motion.div>
  );
}

/* ========================================================================
   SlideIn – slide from left or right
   ======================================================================== */
export function SlideIn({
  children,
  className,
  direction = "left",
  delay = 0,
  ...props
}: {
  children: React.ReactNode;
  className?: string;
  direction?: "left" | "right";
  delay?: number;
} & Omit<HTMLMotionProps<"div">, "children">) {
  const variant = direction === "left" ? slideInLeft : slideInRight;
  return (
    <motion.div
      variants={variant}
      initial="hidden"
      whileInView="visible"
      viewport={VIEWPORT}
      transition={{ delay }}
      className={cn(className)}
      {...props}
    >
      {children}
    </motion.div>
  );
}

/* ========================================================================
   GlassCard – glassmorphism card with hover lift
   ======================================================================== */
export function GlassCard({
  children,
  className,
  hover = true,
  ...props
}: {
  children: React.ReactNode;
  className?: string;
  hover?: boolean;
} & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <motion.div
      whileHover={
        hover
          ? {
              y: -4,
              transition: springSmooth,
            }
          : undefined
      }
      className={cn(
        "bg-white/[0.03] backdrop-blur-xl border border-white/[0.08] rounded-2xl",
        hover &&
          "transition-colors duration-300 hover:bg-white/[0.06] hover:border-white/[0.12] hover:shadow-[0_8px_32px_rgba(0,0,0,0.3)]",
        className
      )}
      {...(props as React.ComponentPropsWithoutRef<typeof motion.div>)}
    >
      {children}
    </motion.div>
  );
}

/* ========================================================================
   AnimatedGradientText – gradient text that shifts colors
   ======================================================================== */
export function AnimatedGradientText({
  children,
  className,
  from,
  via,
  to,
}: {
  children: React.ReactNode;
  className?: string;
  from?: string;
  via?: string;
  to?: string;
}) {
  const gradientFrom = from || '#E8841A';
  const gradientVia = via || '#FF6B35';
  const gradientTo = to || '#FFB347';
  return (
    <motion.span
      className={cn(
        "inline-block bg-clip-text text-transparent bg-[length:200%_200%]",
        "animate-gradient",
        className
      )}
      style={{
        backgroundImage: `linear-gradient(to right, ${gradientFrom}, ${gradientVia}, ${gradientTo})`,
      }}
      animate={{
        backgroundPosition: ["0% 50%", "100% 50%", "0% 50%"],
      }}
      transition={{
        duration: 4,
        ease: "linear",
        repeat: Infinity,
      }}
    >
      {children}
    </motion.span>
  );
}

/* ========================================================================
   GlowButton – button with glow effect on hover
   ======================================================================== */
export function GlowButton({
  children,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <motion.button
      whileHover={{
        scale: 1.02,
        boxShadow: "0 4px 24px rgba(232, 132, 26, 0.4)",
      }}
      whileTap={{ scale: 0.98 }}
      transition={springBouncy}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-lg px-5 py-2.5",
        "text-sm font-semibold text-white",
        "bg-gradient-to-r from-[#E8841A] via-[#FF6B35] to-[#FFB347] bg-[length:200%_200%]",
        "shadow-[0_2px_12px_rgba(232,132,26,0.25)]",
        "transition-all duration-200 ease-out",
        "hover:bg-[100%_50%] hover:shadow-[0_4px_30px_rgba(232,132,26,0.45)]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-primary)]",
        "disabled:pointer-events-none disabled:opacity-50",
        className
      )}
      {...(props as React.ComponentPropsWithoutRef<typeof motion.button>)}
    >
      {children}
    </motion.button>
  );
}

/* ========================================================================
   SectionReveal – wraps a section to reveal on scroll
   ======================================================================== */
export function SectionReveal({
  children,
  className,
  id,
}: {
  children: React.ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <motion.section
      id={id}
      initial={{ opacity: 0, y: 50 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={VIEWPORT}
      transition={{
        duration: 0.7,
        ease: [0.25, 0.4, 0.25, 1],
      }}
      className={cn(className)}
    >
      {children}
    </motion.section>
  );
}

/* ========================================================================
   CounterAnimation – animated number counter
   ======================================================================== */
export function CounterAnimation({
  target,
  suffix = "",
  className,
}: {
  target: number;
  suffix?: string;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-100px" });
  const motionValue = useMotionValue(0);
  const rounded = useSpring(motionValue, { duration: 2000, bounce: 0 });

  useEffect(() => {
    if (isInView) {
      const controls = animate(motionValue, target, {
        duration: 2,
        ease: "easeOut",
      });
      return controls.stop;
    }
  }, [isInView, target, motionValue]);

  return (
    <motion.span ref={ref} className={cn("tabular-nums", className)}>
      {rounded.get().toFixed(target % 1 !== 0 ? 1 : 0)}
      {suffix}
    </motion.span>
  );
}

/* ========================================================================
   TypewriterText – text that appears character by character
   ======================================================================== */
export function TypewriterText({
  text,
  words,
  className,
  delay = 0,
  speed = 30,
}: {
  text?: string;
  words?: string[];
  className?: string;
  delay?: number;
  speed?: number;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-100px" });
  const [displayed, setDisplayed] = useState("");
  const [wordIndex, setWordIndex] = useState(0);

  // Resolve the current text to type
  const currentText = text ?? (words ? words[wordIndex % words.length] : "");

  useEffect(() => {
    if (!isInView || !currentText) return;

    let index = 0;
    const timeout = setTimeout(() => {
      const interval = setInterval(() => {
        if (index < currentText.length) {
          setDisplayed(currentText.slice(0, index + 1));
          index++;
        } else {
          clearInterval(interval);
          // If cycling through words, move to next after a pause
          if (words && words.length > 1) {
            setTimeout(() => {
              setWordIndex(prev => (prev + 1) % words.length);
              setDisplayed("");
            }, 1500);
          }
        }
      }, speed);

      return () => clearInterval(interval);
    }, delay);

    return () => clearTimeout(timeout);
  }, [isInView, currentText, delay, speed, words]);

  return (
    <span ref={ref} className={cn("inline", className)}>
      {displayed}
      <motion.span
        animate={{ opacity: [1, 0] }}
        transition={{ duration: 0.5, repeat: Infinity, repeatType: "reverse" }}
        className="inline-block ml-[1px] w-[2px] h-[1em] bg-[var(--accent)] align-middle"
      >
        &nbsp;
      </motion.span>
    </span>
  );
}
