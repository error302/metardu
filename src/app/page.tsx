'use client'

import { motion } from 'framer-motion'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import {
  FadeUp,
  FadeIn,
  ScaleIn,
  StaggerContainer,
  GlassCard,
  AnimatedGradientText,
  SectionReveal,
  CounterAnimation,
  TypewriterText,
} from '@/components/ui/MotionComponents'

/* ────────────────────────────────────────────────────────────── */
/*  Inline SVG Icons (no react-icons / lucide-react)              */
/* ────────────────────────────────────────────────────────────── */

const Icons = {
  transit: (
    <svg viewBox="0 0 40 40" fill="none" className="w-8 h-8" xmlns="http://www.w3.org/2000/svg">
      <circle cx="20" cy="20" r="16" stroke="currentColor" strokeWidth="1.5" strokeDasharray="4 3" />
      <circle cx="20" cy="20" r="4" fill="currentColor" />
      <line x1="20" y1="4" x2="20" y2="36" stroke="currentColor" strokeWidth="1" opacity="0.5" />
      <line x1="4" y1="20" x2="36" y2="20" stroke="currentColor" strokeWidth="1" opacity="0.5" />
      <line x1="8.7" y1="8.7" x2="31.3" y2="31.3" stroke="currentColor" strokeWidth="0.8" opacity="0.3" />
      <line x1="31.3" y1="8.7" x2="8.7" y2="31.3" stroke="currentColor" strokeWidth="0.8" opacity="0.3" />
    </svg>
  ),
  deedPlan: (
    <svg viewBox="0 0 40 40" fill="none" className="w-8 h-8" xmlns="http://www.w3.org/2000/svg">
      <rect x="6" y="4" width="22" height="30" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <rect x="12" y="4" width="22" height="30" rx="2" stroke="currentColor" strokeWidth="1.5" opacity="0.4" />
      <path d="M16 14h14M16 18h14M16 22h8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      <circle cx="20" cy="10" r="1.5" fill="currentColor" opacity="0.6" />
    </svg>
  ),
  forms: (
    <svg viewBox="0 0 40 40" fill="none" className="w-8 h-8" xmlns="http://www.w3.org/2000/svg">
      <rect x="5" y="6" width="18" height="24" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <path d="M9 12h10M9 16h10M9 20h7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      <rect x="17" y="10" width="18" height="24" rx="2" stroke="currentColor" strokeWidth="1.5" opacity="0.4" strokeDasharray="3 2" />
    </svg>
  ),
  cogo: (
    <svg viewBox="0 0 40 40" fill="none" className="w-8 h-8" xmlns="http://www.w3.org/2000/svg">
      <path d="M8 32L20 6l12 26" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <circle cx="20" cy="6" r="2" fill="currentColor" />
      <circle cx="8" cy="32" r="2" fill="currentColor" />
      <circle cx="32" cy="32" r="2" fill="currentColor" />
      <path d="M12 24h16" stroke="currentColor" strokeWidth="1" opacity="0.4" />
    </svg>
  ),
  gps: (
    <svg viewBox="0 0 40 40" fill="none" className="w-8 h-8" xmlns="http://www.w3.org/2000/svg">
      <path d="M20 6v4M20 30v4M6 20h4M30 20h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="20" cy="20" r="8" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="20" cy="20" r="3" fill="currentColor" />
      <circle cx="20" cy="20" r="14" stroke="currentColor" strokeWidth="0.8" opacity="0.3" />
    </svg>
  ),
  pdf: (
    <svg viewBox="0 0 40 40" fill="none" className="w-8 h-8" xmlns="http://www.w3.org/2000/svg">
      <rect x="8" y="4" width="20" height="32" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <path d="M8 30l6-6 4 4 4-8 6 10" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
      <rect x="24" y="4" width="4" height="8" rx="1" fill="currentColor" opacity="0.3" />
    </svg>
  ),
  check: (
    <svg viewBox="0 0 20 20" fill="none" className="w-5 h-5">
      <path d="M4 10l4 4 8-8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  arrowRight: (
    <svg viewBox="0 0 20 20" fill="none" className="w-4 h-4">
      <path d="M4 10h12m0 0l-4-4m4 4l-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  play: (
    <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5" />
      <path d="M10 8l6 4-6 4V8z" fill="currentColor" />
    </svg>
  ),
  level: (
    <svg viewBox="0 0 40 40" fill="none" className="w-7 h-7">
      <rect x="4" y="16" width="32" height="8" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="20" cy="20" r="3" fill="currentColor" />
      <path d="M8 20h6M26 20h6" stroke="currentColor" strokeWidth="1" opacity="0.4" />
    </svg>
  ),
  coordTransform: (
    <svg viewBox="0 0 40 40" fill="none" className="w-7 h-7">
      <path d="M8 32L8 12l12 0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M12 32L32 32l0-12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.4" />
      <path d="M8 12l24 20" stroke="currentColor" strokeWidth="1" strokeDasharray="3 2" opacity="0.6" />
    </svg>
  ),
  area: (
    <svg viewBox="0 0 40 40" fill="none" className="w-7 h-7">
      <polygon points="20,6 34,16 30,32 10,32 6,16" stroke="currentColor" strokeWidth="1.5" fill="currentColor" fillOpacity="0.1" />
      <text x="20" y="23" textAnchor="middle" fontSize="9" fill="currentColor" fontWeight="bold">A</text>
    </svg>
  ),
  curve: (
    <svg viewBox="0 0 40 40" fill="none" className="w-7 h-7">
      <path d="M6 32Q6 8 34 8" stroke="currentColor" strokeWidth="1.5" fill="none" />
      <circle cx="6" cy="32" r="2" fill="currentColor" />
      <circle cx="34" cy="8" r="2" fill="currentColor" />
      <path d="M6 32l4-2M34 8l-2 4" stroke="currentColor" strokeWidth="1" opacity="0.4" />
    </svg>
  ),
  bearing: (
    <svg viewBox="0 0 40 40" fill="none" className="w-7 h-7">
      <circle cx="20" cy="20" r="12" stroke="currentColor" strokeWidth="1.5" />
      <polygon points="20,8 22,20 20,16 18,20" fill="currentColor" />
      <polygon points="20,32 18,20 20,24 22,20" fill="currentColor" opacity="0.3" />
    </svg>
  ),
  vertical: (
    <svg viewBox="0 0 40 40" fill="none" className="w-7 h-7">
      <path d="M6 8h28" stroke="currentColor" strokeWidth="1" opacity="0.3" />
      <path d="M6 32Q20 32 20 8" stroke="currentColor" strokeWidth="1.5" fill="none" />
      <path d="M20 32Q20 8 34 8" stroke="currentColor" strokeWidth="1.5" fill="none" />
    </svg>
  ),
  settingOut: (
    <svg viewBox="0 0 40 40" fill="none" className="w-7 h-7">
      <circle cx="20" cy="20" r="3" fill="currentColor" />
      <circle cx="8" cy="10" r="2" stroke="currentColor" strokeWidth="1" />
      <circle cx="32" cy="10" r="2" stroke="currentColor" strokeWidth="1" />
      <circle cx="8" cy="30" r="2" stroke="currentColor" strokeWidth="1" />
      <circle cx="32" cy="30" r="2" stroke="currentColor" strokeWidth="1" />
      <line x1="20" y1="20" x2="8" y2="10" stroke="currentColor" strokeWidth="0.8" strokeDasharray="2 2" />
      <line x1="20" y1="20" x2="32" y2="10" stroke="currentColor" strokeWidth="0.8" strokeDasharray="2 2" />
      <line x1="20" y1="20" x2="8" y2="30" stroke="currentColor" strokeWidth="0.8" strokeDasharray="2 2" />
      <line x1="20" y1="20" x2="32" y2="30" stroke="currentColor" strokeWidth="0.8" strokeDasharray="2 2" />
    </svg>
  ),
  subdivision: (
    <svg viewBox="0 0 40 40" fill="none" className="w-7 h-7">
      <rect x="6" y="6" width="28" height="28" stroke="currentColor" strokeWidth="1.5" />
      <line x1="20" y1="6" x2="20" y2="34" stroke="currentColor" strokeWidth="1" />
      <line x1="6" y1="20" x2="34" y2="20" stroke="currentColor" strokeWidth="1" />
    </svg>
  ),
  x: (
    <svg viewBox="0 0 20 20" className="w-5 h-5">
      <path d="M4 4l12 12M16 4L4 16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  ),
  globe: (
    <svg viewBox="0 0 20 20" fill="none" className="w-4 h-4">
      <circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="1.2" />
      <ellipse cx="10" cy="10" rx="4" ry="8" stroke="currentColor" strokeWidth="0.8" />
      <line x1="2" y1="10" x2="18" y2="10" stroke="currentColor" strokeWidth="0.8" />
    </svg>
  ),
  github: (
    <svg viewBox="0 0 20 20" className="w-5 h-5" fill="currentColor">
      <path d="M10 2a8 8 0 00-2.53 15.59c.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.63 7.63 0 014 0c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0018 10a8 8 0 00-8-8z" />
    </svg>
  ),
  twitter: (
    <svg viewBox="0 0 20 20" className="w-5 h-5" fill="currentColor">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" transform="scale(0.833)" />
    </svg>
  ),
}

/* ────────────────────────────────────────────────────────────── */
/*  Data                                                         */
/* ────────────────────────────────────────────────────────────── */

const TYPEWRITER_WORDS = [
  'Traverse Adjustment',
  'COGO Tools',
  'Deed Plans',
  'GPS Stakeout',
  'Leveling',
]

const STATS = [
  { value: 60, suffix: '', label: 'UTM Zones' },
  { value: 50, suffix: '+', label: 'Countries' },
  { value: 10, suffix: 'K+', label: 'Surveyors' },
  { value: 100, suffix: '%', label: 'Built in Africa' },
]

const TRUST_COUNTRIES = [
  'Kenya', 'Nigeria', 'Ghana', 'South Africa', 'Tanzania',
  'Uganda', 'Rwanda', 'Ethiopia', 'Botswana', 'Zimbabwe',
  'Mozambique', 'Cameroon', 'Senegal', 'Zambia', 'Malawi',
]

const BENTO_FEATURES = [
  {
    icon: Icons.transit,
    title: 'Traverse Adjustment',
    description:
      'Bowditch, Transit, and Compass rule adjustments. Automatic misclosure detection with precision grading for all African survey standards.',
    span: 'md:col-span-2',
    accent: true,
  },
  {
    icon: Icons.deedPlan,
    title: 'Deed Plan Generation',
    description:
      'Auto-generate Kenya deed plans with signature blocks, bearing tables, and area computations compliant with Survey Act requirements.',
    span: '',
    accent: false,
  },
  {
    icon: Icons.forms,
    title: 'RIM & CLA Forms',
    description:
      'Community Land Act forms, Resurvey Index Maps, and all mandatory regulatory documents pre-formatted for submission.',
    span: '',
    accent: false,
  },
  {
    icon: Icons.cogo,
    title: 'COGO Calculations',
    description:
      'Intersection, resection, area computations, and coordinate conversions. Full working shown for every calculation.',
    span: '',
    accent: false,
  },
  {
    icon: Icons.gps,
    title: 'GPS Stakeout',
    description:
      'Field navigation for point setting with real-time distance and bearing guidance. Works offline with downloaded maps.',
    span: '',
    accent: false,
  },
  {
    icon: Icons.pdf,
    title: 'PDF Reports',
    description:
      'Professional survey reports, certificates, and title block sheets. One-click export with your company branding.',
    span: 'md:col-span-2',
    accent: false,
  },
]

const HOW_IT_WORKS_STEPS = [
  {
    number: '01',
    title: 'Enter Your Observations',
    description: 'Input field book data — bearings, distances, angles, and leveling readings. Import from CSV or type directly.',
    emoji: '📝',
  },
  {
    number: '02',
    title: 'Adjust & Calculate',
    description: 'Run traverse adjustments, COGO computations, and leveling reductions with one click. Full audit trail included.',
    emoji: '⚙️',
  },
  {
    number: '03',
    title: 'Export & Submit',
    description: 'Generate professional PDFs, DXF files, and coordinate schedules ready for regulatory submission.',
    emoji: '📄',
  },
]

const PRO_TOOLS = [
  { icon: Icons.level, title: 'Leveling', description: 'Rise & fall, HPC, and reciprocal leveling with full checks.' },
  { icon: Icons.coordTransform, title: 'Coordinate Transform', description: 'UTM, local grid, and datum transformations across Africa.' },
  { icon: Icons.area, title: 'Area Calculation', description: 'By coordinates, double-meridian distance, or planimeter.' },
  { icon: Icons.curve, title: 'Curve Design', description: 'Horizontal and vertical curve elements with stakeout tables.' },
  { icon: Icons.bearing, title: 'Bearing & Distance', description: 'Forward, inverse, and azimuth calculations with full working.' },
  { icon: Icons.vertical, title: 'Vertical Curves', description: 'Symmetric, asymmetric, and compound vertical curve design.' },
  { icon: Icons.settingOut, title: 'Setting Out', description: 'Coordinate-based point setting with offset and reference lines.' },
  { icon: Icons.subdivision, title: 'Subdivision', description: 'Parcel splitting with area balancing and automatic numbering.' },
]

const PRICING = [
  {
    tier: 'Starter',
    price: 'Free',
    period: 'forever',
    description: 'Perfect for students and occasional use.',
    features: ['5 projects', 'Basic traverse tools', 'COGO calculator', 'PDF export (watermarked)', 'Community support'],
    cta: 'Get Started Free',
    href: '/register',
    highlighted: false,
  },
  {
    tier: 'Professional',
    price: '$49',
    period: '/month',
    description: 'For licensed surveyors and small firms.',
    features: [
      'Unlimited projects',
      'All adjustment methods',
      'Deed plan generation',
      'GNSS integration',
      'RIM & CLA forms',
      'Branded PDF reports',
      'Priority support',
    ],
    cta: 'Start Free Trial',
    href: '/register',
    highlighted: true,
  },
  {
    tier: 'Enterprise',
    price: '$199',
    period: '/month',
    description: 'For government agencies and large firms.',
    features: [
      'Everything in Professional',
      'White-label branding',
      'REST API access',
      'Team collaboration',
      'Dedicated support',
      'SLA guarantee',
      'On-premise option',
    ],
    cta: 'Contact Sales',
    href: 'mailto:sales@metardu.app',
    highlighted: false,
  },
]

/* ────────────────────────────────────────────────────────────── */
/*  Component                                                    */
/* ────────────────────────────────────────────────────────────── */

export default function LandingPage() {
  return (
    <div className="bg-[var(--bg-primary)] text-[var(--text-primary)] overflow-x-hidden">
      {/* ─── HERO ─────────────────────────────────────────────── */}
      <HeroSection />

      {/* ─── TRUST BAR ───────────────────────────────────────── */}
      <TrustBar />

      {/* ─── FEATURES BENTO ──────────────────────────────────── */}
      <FeaturesBento />

      {/* ─── HOW IT WORKS ────────────────────────────────────── */}
      <HowItWorks />

      {/* ─── PROFESSIONAL TOOLS ──────────────────────────────── */}
      <ProfessionalTools />

      {/* ─── PRICING ─────────────────────────────────────────── */}
      <PricingSection />

      {/* ─── FINAL CTA ───────────────────────────────────────── */}
      <FinalCTA />

      {/* ─── FOOTER ──────────────────────────────────────────── */}
      <Footer />
    </div>
  )
}

/* ============================================================= */
/*  HERO SECTION                                                 */
/* ============================================================= */

function HeroSection() {
  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden">
      {/* Animated mesh gradient background */}
      <div className="absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-[var(--bg-primary)]" />
        <div
          className="absolute inset-0 opacity-30"
          style={{
            background:
              'radial-gradient(ellipse at 20% 50%, rgba(232,132,26,0.08) 0%, transparent 50%), radial-gradient(ellipse at 80% 20%, rgba(232,132,26,0.05) 0%, transparent 50%), radial-gradient(ellipse at 50% 80%, rgba(232,132,26,0.06) 0%, transparent 50%)',
          }}
        />
        {/* Animated gradient orbs */}
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
      </div>

      {/* Grid pattern overlay */}
      <div className="absolute inset-0 -z-[5] opacity-[0.03]">
        <svg width="100%" height="100%">
          <defs>
            <pattern id="hero-grid" width="48" height="48" patternUnits="userSpaceOnUse">
              <path d="M 48 0 L 0 0 0 48" fill="none" stroke="white" strokeWidth="0.5" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#hero-grid)" />
        </svg>
      </div>

      {/* Content */}
      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 pt-32 pb-20 md:pt-40 md:pb-28 text-center">
        <FadeUp>
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[var(--accent)]/10 border border-[var(--accent)]/20 text-[var(--accent)] text-sm font-medium mb-8">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--accent)] opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-[var(--accent)]" />
            </span>
            Built for African Surveyors
          </div>
        </FadeUp>

        <FadeUp delay={0.1}>
          <h1 className="text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-bold leading-[1.05] tracking-tight mb-6">
            <span className="block">Precision Land</span>
            <span className="block">
              <AnimatedGradientText
                className="text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-bold"
                from="rgb(232,132,26)"
                via="rgb(255,180,80)"
                to="rgb(232,132,26)"
              >
                Surveying
              </AnimatedGradientText>
            </span>
          </h1>
        </FadeUp>

        <FadeUp delay={0.2}>
          <div className="h-10 md:h-12 flex items-center justify-center mb-8">
            <span className="text-[var(--text-muted)] text-lg md:text-xl mr-3">Built for</span>
            <TypewriterText
              words={TYPEWRITER_WORDS}
              className="text-lg md:text-xl font-semibold text-[var(--accent)]"
            />
          </div>
        </FadeUp>

        <FadeUp delay={0.3}>
          <p className="max-w-2xl mx-auto text-base sm:text-lg text-[var(--text-secondary)] leading-relaxed mb-10">
            METARDU is the professional surveying platform built from Kenya for Africa. Traverse adjustments,
            deed plans, COGO, and field tools — all in one place, designed for the standards you work with every day.
          </p>
        </FadeUp>

        <FadeUp delay={0.4}>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16">
            <Link
              href="/register"
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#E8841A] via-[#FF6B35] to-[#FFB347] px-8 py-4 text-base font-bold text-black shadow-[0_2px_12px_rgba(232,132,26,0.25)] transition-all duration-200 ease-out hover:scale-[1.02] hover:brightness-110 hover:shadow-[0_4px_30px_rgba(232,132,26,0.45)]"
            >
              Get Started Free
              {Icons.arrowRight}
            </Link>
            <Link
              href="#demo"
              className="flex items-center gap-2 px-8 py-4 bg-[var(--bg-secondary)] text-[var(--text-primary)] font-semibold rounded-xl border border-[var(--border-color)] hover:border-[var(--accent)]/50 transition-all text-base"
            >
              {Icons.play}
              Watch Demo
            </Link>
          </div>
        </FadeUp>

        {/* Stats bar */}
        <FadeUp delay={0.6}>
          <div className="max-w-3xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-6 md:gap-8 pt-10 border-t border-[var(--border-color)]">
            {STATS.map((stat, i) => (
              <div key={i} className="text-center">
                {stat.value !== null ? (
                  <div className="text-2xl md:text-3xl font-bold text-[var(--text-primary)] font-mono">
                    <CounterAnimation target={stat.value} suffix={stat.suffix} />
                  </div>
                ) : (
                  <div className="text-2xl md:text-3xl font-bold text-[var(--accent)]">🌍</div>
                )}
                <div className="text-xs md:text-sm text-[var(--text-muted)] mt-1 uppercase tracking-wider">
                  {stat.label}
                </div>
              </div>
            ))}
          </div>
        </FadeUp>
      </div>

      {/* Bottom fade */}
      <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-[var(--bg-primary)] to-transparent" />
    </section>
  )
}

/* ============================================================= */
/*  TRUST BAR                                                    */
/* ============================================================= */

function TrustBar() {
  return (
    <section className="relative py-12 border-y border-[var(--border-color)] bg-[var(--bg-secondary)] overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <FadeIn>
          <p className="text-center text-[var(--text-muted)] text-sm mb-8 uppercase tracking-widest font-medium">
            Trusted by surveyors across the continent
          </p>
        </FadeIn>
      </div>

      {/* Marquee */}
      <div className="relative">
        <div className="flex animate-marquee whitespace-nowrap">
          {[...TRUST_COUNTRIES, ...TRUST_COUNTRIES].map((country, i) => (
            <span
              key={i}
              className="mx-6 text-[var(--text-muted)] text-sm font-medium flex items-center gap-2"
            >
              <span className="w-1 h-1 rounded-full bg-[var(--accent)] opacity-50" />
              {country}
            </span>
          ))}
        </div>
        {/* Fade edges */}
        <div className="absolute left-0 top-0 bottom-0 w-24 bg-gradient-to-r from-[var(--bg-secondary)] to-transparent pointer-events-none" />
        <div className="absolute right-0 top-0 bottom-0 w-24 bg-gradient-to-l from-[var(--bg-secondary)] to-transparent pointer-events-none" />
      </div>

      <style jsx>{`
        @keyframes marquee {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .animate-marquee {
          animation: marquee 30s linear infinite;
        }
      `}</style>
    </section>
  )
}

/* ============================================================= */
/*  FEATURES BENTO GRID                                          */
/* ============================================================= */

function FeaturesBento() {
  return (
    <section className="py-24 md:py-32">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <SectionReveal>
          <div className="text-center mb-16">
            <p className="text-[var(--accent)] text-sm font-semibold uppercase tracking-widest mb-4">
              Feature Suite
            </p>
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold mb-4">
              Everything You Need for
              <br />
              <span className="text-[var(--accent)]">Professional Surveying</span>
            </h2>
            <p className="max-w-2xl mx-auto text-[var(--text-secondary)] text-base md:text-lg">
              Six core modules purpose-built for the African surveyor. From field observations
              to regulatory submission, METARDU handles it all.
            </p>
          </div>
        </SectionReveal>

        <StaggerContainer
          className="grid grid-cols-1 md:grid-cols-3 gap-5 md:gap-6"
          staggerDelay={0.08}
        >
          {BENTO_FEATURES.map((feature, i) => (
            <GlassCard
              key={i}
              className={cn(
                'group relative p-6 md:p-8 rounded-2xl border border-[var(--border-color)] bg-[var(--bg-secondary)]',
                'hover:border-[var(--accent)]/30 transition-all duration-300 hover:-translate-y-1',
                'hover:shadow-[0_8px_40px_-12px_rgba(232,132,26,0.15)]',
                feature.span,
                feature.accent && 'border-[var(--accent)]/20 bg-gradient-to-br from-[var(--accent)]/5 to-transparent',
              )}
            >
              {feature.accent && (
                <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[var(--accent)]/40 to-transparent" />
              )}
              <div
                className={cn(
                  'w-12 h-12 rounded-xl flex items-center justify-center mb-5 transition-colors',
                  'bg-[var(--accent)]/10 text-[var(--accent)] group-hover:bg-[var(--accent)]/20',
                )}
              >
                {feature.icon}
              </div>
              <h3 className="text-lg md:text-xl font-bold text-[var(--text-primary)] mb-3">
                {feature.title}
              </h3>
              <p className="text-sm md:text-base text-[var(--text-secondary)] leading-relaxed">
                {feature.description}
              </p>
              {feature.accent && (
                <div className="mt-5 flex items-center gap-2 text-[var(--accent)] text-sm font-medium group-hover:gap-3 transition-all">
                  <span>Explore</span>
                  {Icons.arrowRight}
                </div>
              )}
            </GlassCard>
          ))}
        </StaggerContainer>
      </div>
    </section>
  )
}

/* ============================================================= */
/*  HOW IT WORKS                                                 */
/* ============================================================= */

function HowItWorks() {
  return (
    <section className="py-24 md:py-32 bg-[var(--bg-secondary)] border-y border-[var(--border-color)]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <SectionReveal>
          <div className="text-center mb-16">
            <p className="text-[var(--accent)] text-sm font-semibold uppercase tracking-widest mb-4">
              Workflow
            </p>
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold mb-4">
              Survey Smarter in{' '}
              <span className="text-[var(--accent)]">3 Steps</span>
            </h2>
            <p className="max-w-xl mx-auto text-[var(--text-secondary)] text-base md:text-lg">
              From raw field observations to submission-ready documents in minutes.
            </p>
          </div>
        </SectionReveal>

        <div className="grid md:grid-cols-3 gap-8 md:gap-12 relative">
          {/* Connecting line */}
          <div className="hidden md:block absolute top-16 left-[20%] right-[20%] h-px">
            <motion.div
              className="h-full bg-gradient-to-r from-[var(--accent)]/0 via-[var(--accent)]/30 to-[var(--accent)]/0"
              initial={{ scaleX: 0 }}
              whileInView={{ scaleX: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 1, delay: 0.5 }}
              style={{ transformOrigin: 'left' }}
            />
          </div>

          {HOW_IT_WORKS_STEPS.map((step, i) => (
            <FadeUp key={i} delay={0.15 * i}>
              <div className="relative text-center md:text-left">
                <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-[var(--bg-primary)] border border-[var(--border-color)] text-2xl mb-6 relative z-10">
                  {step.emoji}
                </div>
                <div className="text-[var(--accent)] font-mono text-sm font-bold mb-2 opacity-60">
                  STEP {step.number}
                </div>
                <h3 className="text-xl md:text-2xl font-bold text-[var(--text-primary)] mb-3">
                  {step.title}
                </h3>
                <p className="text-[var(--text-secondary)] text-sm md:text-base leading-relaxed">
                  {step.description}
                </p>
              </div>
            </FadeUp>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ============================================================= */
/*  PROFESSIONAL TOOLS                                           */
/* ============================================================= */

function ProfessionalTools() {
  return (
    <section className="py-24 md:py-32">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <SectionReveal>
          <div className="text-center mb-16">
            <p className="text-[var(--accent)] text-sm font-semibold uppercase tracking-widest mb-4">
              Tool Library
            </p>
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold mb-4">
              Professional-Grade Tools,{' '}
              <span className="text-[var(--accent)]">Free to Start</span>
            </h2>
            <p className="max-w-xl mx-auto text-[var(--text-secondary)] text-base md:text-lg">
              A comprehensive suite of surveying calculators and generators used by professionals across Africa.
            </p>
          </div>
        </SectionReveal>

        <StaggerContainer className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-5" staggerDelay={0.06}>
          {PRO_TOOLS.map((tool, i) => (
            <GlassCard
              key={i}
              className={cn(
                'group p-5 rounded-xl border border-[var(--border-color)] bg-[var(--bg-secondary)]',
                'hover:border-[var(--accent)]/30 transition-all duration-300 hover:-translate-y-0.5',
                'cursor-pointer',
              )}
            >
              <div className="w-10 h-10 rounded-lg bg-[var(--accent)]/10 text-[var(--accent)] flex items-center justify-center mb-4 group-hover:bg-[var(--accent)]/20 transition-colors">
                {tool.icon}
              </div>
              <h3 className="font-bold text-[var(--text-primary)] text-sm mb-1.5">{tool.title}</h3>
              <p className="text-xs text-[var(--text-secondary)] leading-relaxed">{tool.description}</p>
            </GlassCard>
          ))}
        </StaggerContainer>
      </div>
    </section>
  )
}

/* ============================================================= */
/*  PRICING                                                      */
/* ============================================================= */

function PricingSection() {
  return (
    <section className="py-24 md:py-32 bg-[var(--bg-secondary)] border-y border-[var(--border-color)] relative overflow-hidden">
      {/* Subtle background glow for highlighted card */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-[var(--accent)]/5 blur-[120px] pointer-events-none" />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6">
        <SectionReveal>
          <div className="text-center mb-16">
            <p className="text-[var(--accent)] text-sm font-semibold uppercase tracking-widest mb-4">
              Pricing
            </p>
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold mb-4">
              Start Free,{' '}
              <span className="text-[var(--accent)]">Scale as You Grow</span>
            </h2>
            <p className="max-w-xl mx-auto text-[var(--text-secondary)] text-base md:text-lg">
              No hidden fees. No per-computation charges. Just straightforward pricing for real surveyors.
            </p>
          </div>
        </SectionReveal>

        <StaggerContainer className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8 items-start" staggerDelay={0.1}>
          {PRICING.map((plan, i) => (
            <GlassCard
              key={i}
              className={cn(
                'relative p-6 md:p-8 rounded-2xl border transition-all duration-300',
                plan.highlighted
                  ? 'border-[var(--accent)] bg-[var(--bg-primary)] shadow-[0_0_60px_-15px_rgba(232,132,26,0.2)] scale-[1.02]'
                  : 'border-[var(--border-color)] bg-[var(--bg-primary)] hover:border-[var(--accent)]/20',
              )}
            >
              {plan.highlighted && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 bg-[var(--accent)] text-black text-xs font-bold rounded-full uppercase tracking-wider">
                  Most Popular
                </div>
              )}

              <div className="mb-6">
                <h3 className="text-lg font-bold text-[var(--text-primary)] mb-1">{plan.tier}</h3>
                <p className="text-sm text-[var(--text-muted)] mb-4">{plan.description}</p>
                <div className="flex items-baseline gap-1">
                  <span className="text-4xl md:text-5xl font-bold text-[var(--text-primary)]">{plan.price}</span>
                  <span className="text-[var(--text-muted)] text-sm">{plan.period}</span>
                </div>
              </div>

              <ul className="space-y-3 mb-8">
                {plan.features.map((feature, j) => (
                  <li key={j} className="flex items-start gap-3 text-sm text-[var(--text-secondary)]">
                    <span className="mt-0.5 text-[var(--accent)] flex-shrink-0">{Icons.check}</span>
                    {feature}
                  </li>
                ))}
              </ul>

              <Link
                href={plan.href}
                className={cn(
                  'block text-center py-3.5 rounded-xl font-semibold text-sm transition-all',
                  plan.highlighted
                    ? 'bg-[var(--accent)] text-black hover:brightness-110 shadow-lg shadow-[var(--accent)]/20'
                    : 'bg-[var(--bg-tertiary)] text-[var(--text-primary)] border border-[var(--border-color)] hover:border-[var(--accent)]/30',
                )}
              >
                {plan.cta}
              </Link>
            </GlassCard>
          ))}
        </StaggerContainer>
      </div>
    </section>
  )
}

/* ============================================================= */
/*  FINAL CTA                                                    */
/* ============================================================= */

function FinalCTA() {
  return (
    <section className="py-24 md:py-32 relative overflow-hidden">
      {/* Gradient background */}
      <div className="absolute inset-0 -z-10">
        <div
          className="absolute inset-0"
          style={{
            background:
              'radial-gradient(ellipse at 50% 50%, rgba(232,132,26,0.08) 0%, transparent 60%)',
          }}
        />
        <div className="absolute inset-0 bg-[var(--bg-primary)]" style={{ opacity: 0.8 }} />
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 text-center">
        <SectionReveal>
          <h2 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold mb-6 leading-tight">
            Ready to Transform Your
            <br />
            <span className="text-[var(--accent)]">Surveying Workflow?</span>
          </h2>
          <p className="max-w-xl mx-auto text-[var(--text-secondary)] text-base md:text-lg mb-10 leading-relaxed">
            Join thousands of surveyors across Africa who&apos;ve already made the switch.
            Start free — no credit card required.
          </p>

          <Link
            href="/register"
            className="inline-flex items-center gap-3 rounded-2xl bg-gradient-to-r from-[#E8841A] via-[#FF6B35] to-[#FFB347] px-10 py-5 text-lg font-bold text-black shadow-[0_2px_12px_rgba(232,132,26,0.25)] transition-all duration-200 ease-out hover:scale-[1.02] hover:brightness-110 hover:shadow-[0_4px_30px_rgba(232,132,26,0.45)]"
          >
            Get Started Free
            {Icons.arrowRight}
          </Link>

          <p className="mt-6 text-[var(--text-muted)] text-sm">
            Free forever plan available &middot; No credit card needed &middot; Setup in 60 seconds
          </p>
        </SectionReveal>
      </div>
    </section>
  )
}

/* ============================================================= */
/*  FOOTER                                                       */
/* ============================================================= */

function Footer() {
  const footerLinks = {
    Product: [
      { label: 'Features', href: '#features' },
      { label: 'Pricing', href: '#pricing' },
      { label: 'Tools', href: '/tools' },
      { label: 'API Docs', href: '/docs' },
    ],
    Resources: [
      { label: 'Survey Guide', href: '/guide' },
      { label: 'Tools', href: '/tools' },
      { label: 'Survey Regulations', href: '/tools/survey-regulations' },
      { label: 'Documentation', href: '/docs' },
    ],
    Company: [
      { label: 'About', href: '#features' },
      { label: 'Pricing', href: '#pricing' },
      { label: 'Field Tools', href: '/field' },
      { label: 'Documentation', href: '/docs' },
    ],
  }

  return (
    <footer className="border-t border-[var(--border-color)] bg-[var(--bg-secondary)]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-16">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-10 md:gap-8">
          {/* Brand */}
          <div className="col-span-2 md:col-span-2">
            <Link href="/" className="inline-block mb-4">
              <h3 className="text-2xl font-bold tracking-tight">
                META<span className="text-[var(--accent)]">RDU</span>
              </h3>
            </Link>
            <p className="text-[var(--text-secondary)] text-sm leading-relaxed max-w-xs mb-6">
              Professional land surveying platform built from Kenya for Africa.
              Precision tools for the modern surveyor.
            </p>
            <div className="flex items-center gap-4">
              <a
                href="https://twitter.com/metardu"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors"
                aria-label="Twitter"
              >
                {Icons.twitter}
              </a>
              <a
                href="https://github.com/metardu"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors"
                aria-label="GitHub"
              >
                {Icons.github}
              </a>
              <a
                href="mailto:hello@metardu.app"
                className="text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors"
                aria-label="Email"
              >
                {Icons.globe}
              </a>
            </div>
          </div>

          {/* Link columns */}
          {Object.entries(footerLinks).map(([title, links]) => (
            <div key={title}>
              <h4 className="text-sm font-semibold text-[var(--text-primary)] uppercase tracking-wider mb-4">
                {title}
              </h4>
              <ul className="space-y-3">
                {links.map((link) => (
                  <li key={link.label}>
                    <Link
                      href={link.href}
                      className="text-sm text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Bottom bar */}
        <div className="mt-16 pt-8 border-t border-[var(--border-color)] flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-xs text-[var(--text-muted)]">
            &copy; {new Date().getFullYear()} METARDU. All rights reserved.
          </p>
          <p className="text-xs text-[var(--text-muted)] flex items-center gap-1.5">
            Built with{' '}
            <span className="text-[var(--accent)]">precision</span> in Kenya{' '}
            <span className="text-base">🇰🇪</span>
          </p>
        </div>
      </div>
    </footer>
  )
}
