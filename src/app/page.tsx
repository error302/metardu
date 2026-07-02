'use client'

import Link from 'next/link'
import MetarduLogo from '@/components/MetarduLogo'
import {
  Waypoints, FileBadge, Mountain, DraftingCompass,
  Satellite, FileChartColumn, MapPinned, Calculator,
  ShieldCheck, Globe, Smartphone, Cloud,
} from 'lucide-react'

/* ────────────────────────────────────────────────────────────── */
/*  Data                                                          */
/* ────────────────────────────────────────────────────────────── */

const STATS = [
  { value: 60, suffix: '+', label: 'Survey Tools' },
  { value: 14, suffix: '', label: 'Languages' },
  { value: 9, suffix: '', label: 'Survey Types' },
  { value: 13, suffix: '', label: 'Currencies' },
]

const FEATURES = [
  {
    icon: Waypoints,
    title: 'Traverse Adjustment',
    description: 'Bowditch, Transit, and Least Squares adjustment with RDM 1.1 accuracy grading. Full bearing/distance computation with closure checks.',
  },
  {
    icon: FileBadge,
    title: 'Deed Plan Generation',
    description: 'Survey Act Cap. 299 compliant Form No. 4 with SVG, PDF, and DXF output. SHA-256 verified, Director of Surveys authentication block.',
  },
  {
    icon: Mountain,
    title: 'Topographic Surveys',
    description: 'TIN generation, contour extraction, volume computation. Web Worker TIN for large datasets. Auto breakline detection from mesh analysis.',
  },
  {
    icon: DraftingCompass,
    title: 'COGO Engine',
    description: 'Intersection, resection, radiation, bearing-distance. Full coordinate geometry with solution steps shown for every calculation.',
  },
  {
    icon: Satellite,
    title: 'GNSS Baseline Processing',
    description: 'Upload RINEX files and get adjusted coordinates via RTKLIB integration. No external software needed — process baselines right in the browser.',
  },
  {
    icon: FileChartColumn,
    title: 'Statutory Documents',
    description: 'RDM 1.1 survey reports, Form C-22, CLA forms, computation workbooks. NLIMS-ready exports with ArdhiSasa integration.',
  },
]

const WORKFLOW_STEPS = [
  { number: '01', title: 'Set Up Project', description: 'Enter project details, LR number, UTM zone, and surveyor credentials. METARDU handles the rest.' },
  { number: '02', title: 'Collect & Compute', description: 'Import field data from total stations, GNSS, or CSV. Run Bowditch, levelling, COGO, and curve calculations with full working shown.' },
  { number: '03', title: 'Submit & Archive', description: 'Generate deed plans, survey reports, and NLIMS exports. Every computation is audit-chained for legal compliance.' },
]

const TOOLS = [
  { icon: Calculator, title: 'Traverse', description: 'Bowditch & Transit adjustment' },
  { icon: MapPinned, title: 'COGO', description: 'Intersection & resection' },
  { icon: Mountain, title: 'Contours', description: 'TIN + marching triangles' },
  { icon: DraftingCompass, title: 'Curves', description: 'Horizontal & vertical design' },
  { icon: Satellite, title: 'GNSS', description: 'RINEX baseline processing' },
  { icon: FileBadge, title: 'Deed Plans', description: 'Form No. 4 generation' },
  { icon: FileChartColumn, title: 'Reports', description: 'RDM 1.1 survey reports' },
  { icon: ShieldCheck, title: 'Validation', description: 'NLIMS pre-flight checks' },
]

const PRICING = [
  {
    tier: 'Free',
    description: 'For students & occasional use',
    price: 'KSh 0',
    period: '/month',
    features: ['All quick calculation tools', '1 survey project', 'Up to 50 survey points', 'Basic PDF report', 'CSV import', 'Offline calculations'],
    cta: 'Start Free',
    href: '/register',
    highlighted: false,
  },
  {
    tier: 'Pro',
    description: 'For licensed surveyors',
    price: 'KSh 500',
    period: '/month',
    features: ['Everything in Free', 'Unlimited projects', 'AI-powered features', 'GNSS baseline processing', 'Deed plan generation', 'NLIMS exports', 'Priority support'],
    cta: 'Start Pro',
    href: '/checkout?plan=pro',
    highlighted: true,
  },
  {
    tier: 'Team',
    description: 'For surveying firms',
    price: 'KSh 2,000',
    period: '/month',
    features: ['Everything in Pro', 'Up to 10 team members', 'Shared project workspace', 'Audit trail & permissions', 'M-Pesa & Stripe billing', 'API access'],
    cta: 'Start Team',
    href: '/checkout?plan=team',
    highlighted: false,
  },
]

/* ────────────────────────────────────────────────────────────── */
/*  Component                                                    */
/* ────────────────────────────────────────────────────────────── */

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[var(--bg-primary)] text-[var(--text-primary)] overflow-x-hidden">
      <HeroSection />
      <StatsBar />
      <FeaturesSection />
      <WorkflowSection />
      <ToolsSection />
      <PricingSection />
      <Footer />
    </div>
  )
}

/* ============================================================= */
/*  HERO                                                         */
/* ============================================================= */

function HeroSection() {
  return (
    <section className="relative min-h-screen flex flex-col">
      {/* Background image with overlay */}
      <div className="absolute inset-0">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/landing/hero-topo.jpg"
          alt="Topographic survey map"
          className="w-full h-full object-cover"
          style={{ filter: 'brightness(0.35) contrast(1.1)' }}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-[var(--bg-primary)]/80 via-[var(--bg-primary)]/60 to-[var(--bg-primary)]" />
      </div>

      {/* Navigation */}
      <nav className="relative z-10 px-4 sm:px-6 lg:px-12 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <Link href="/" className="no-underline">
            <MetarduLogo size={32} showWordmark={true} color="#FFFFFF" />
          </Link>
          <div className="hidden md:flex items-center gap-8">
            <Link href="#features" className="text-sm text-[var(--text-primary)]/70 hover:text-[var(--text-primary)] transition-colors no-underline">Features</Link>
            <Link href="#workflow" className="text-sm text-[var(--text-primary)]/70 hover:text-[var(--text-primary)] transition-colors no-underline">Workflow</Link>
            <Link href="/pricing" className="text-sm text-[var(--text-primary)]/70 hover:text-[var(--text-primary)] transition-colors no-underline">Pricing</Link>
            <Link href="/docs" className="text-sm text-[var(--text-primary)]/70 hover:text-[var(--text-primary)] transition-colors no-underline">Docs</Link>
            <Link href="/login" className="text-sm text-[var(--text-primary)]/70 hover:text-[var(--text-primary)] transition-colors no-underline">Sign in</Link>
            <Link
              href="/register"
              className="px-5 py-2 bg-[var(--accent)] text-[var(--bg-primary)] font-medium rounded-lg text-sm hover:bg-[var(--accent-dim)] transition-all no-underline"
            >
              Get Started
            </Link>
          </div>
          <Link
            href="/login"
            className="md:hidden px-4 py-2 text-sm text-[var(--text-primary)]/80 border border-[var(--border-color)] rounded-lg no-underline"
          >
            Sign in
          </Link>
        </div>
      </nav>

      {/* Hero content */}
      <div className="relative z-10 flex-1 flex items-center">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-12 py-20 w-full">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[var(--bg-tertiary)] border border-[var(--border-color)] mb-6">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-xs text-[var(--text-primary)]/60 font-mono tracking-wide">Built in Nairobi · Cassini · UTM 36S/37S · Arc 1960</span>
            </div>

            <h1 className="text-4xl sm:text-5xl lg:text-7xl font-bold leading-[1.05] tracking-tight mb-6">
              Surveying software
              <br />
              built for{' '}
              <span className="bg-gradient-to-r from-[var(--accent)] to-[var(--accent-dim)] bg-clip-text text-transparent">
                East Africa.
              </span>
            </h1>

            <p className="text-lg sm:text-xl text-[var(--text-primary)]/60 leading-relaxed mb-8 max-w-2xl">
              Traverse adjustment, deed plans, GNSS baseline processing, contour generation,
              and NLIMS-ready exports — all in one professional workspace. From field to finish,
              built for Kenyan surveyors.
            </p>

            <div className="flex flex-col sm:flex-row gap-4">
              <Link
                href="/register"
                className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-[var(--accent)] text-[var(--bg-primary)] font-semibold rounded-xl text-sm hover:bg-[var(--accent-dim)] hover:scale-[1.02] transition-all no-underline"
              >
                Start a project
                <span aria-hidden>→</span>
              </Link>
              <Link
                href="#features"
                className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-[var(--bg-tertiary)] border border-[var(--border-color)] text-[var(--text-primary)] font-medium rounded-xl text-sm hover:bg-[var(--bg-tertiary)] transition-all no-underline"
              >
                Explore features
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

/* ============================================================= */
/*  STATS BAR                                                    */
/* ============================================================= */

function StatsBar() {
  return (
    <section className="border-y border-[var(--border-color)] bg-[var(--bg-secondary)]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-12 py-12 grid grid-cols-2 md:grid-cols-4 gap-8">
        {STATS.map((stat, i) => (
          <div key={i} className="text-center">
            <div className="text-3xl sm:text-4xl font-bold text-[var(--text-primary)]">
              {stat.value}{stat.suffix}
            </div>
            <div className="text-xs text-[var(--text-primary)]/40 mt-2 uppercase tracking-widest">
              {stat.label}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

/* ============================================================= */
/*  FEATURES                                                     */
/* ============================================================= */

function FeaturesSection() {
  return (
    <section id="features" className="py-24 md:py-32">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-12">
        <div className="text-center mb-16">
          <p className="text-[var(--accent)] text-sm font-semibold uppercase tracking-widest mb-4">
            Feature Suite
          </p>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold mb-4">
            Everything you need for
            <br />
            <span className="text-[var(--accent)]">professional surveying</span>
          </h2>
          <p className="max-w-2xl mx-auto text-[var(--text-primary)]/50 text-base lg:text-lg">
            Six core modules purpose-built for the East African surveyor. From field observations
            to regulatory submission.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {FEATURES.map((feature, i) => {
            const Icon = feature.icon
            return (
              <div
                key={i}
                className="group p-8 rounded-2xl bg-[var(--bg-secondary)] border border-[var(--border-color)] hover:border-[var(--accent)]/20 transition-all duration-300 hover:-translate-y-1"
              >
                <div className="w-12 h-12 rounded-xl bg-[var(--accent)]/10 flex items-center justify-center mb-5 group-hover:bg-[var(--accent)]/20 transition-colors">
                  <Icon className="w-6 h-6 text-[var(--accent)]" />
                </div>
                <h3 className="text-lg font-bold text-[var(--text-primary)] mb-3">{feature.title}</h3>
                <p className="text-sm text-[var(--text-primary)]/50 leading-relaxed">{feature.description}</p>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}

/* ============================================================= */
/*  WORKFLOW                                                     */
/* ============================================================= */

function WorkflowSection() {
  return (
    <section id="workflow" className="py-24 md:py-32 bg-[var(--bg-secondary)] border-y border-[var(--border-color)]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-12">
        <div className="text-center mb-16">
          <p className="text-[var(--accent)] text-sm font-semibold uppercase tracking-widest mb-4">
            Workflow
          </p>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold mb-4">
            Survey smarter in{' '}
            <span className="text-[var(--accent)]">3 steps</span>
          </h2>
          <p className="max-w-xl mx-auto text-[var(--text-primary)]/50 text-base lg:text-lg">
            From raw field observations to submission-ready documents.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-8 md:gap-12">
          {WORKFLOW_STEPS.map((step, i) => (
            <div key={i} className="text-center md:text-left">
              <div className="text-5xl font-bold text-[var(--accent)]/20 mb-4">{step.number}</div>
              <h3 className="text-xl font-bold text-[var(--text-primary)] mb-3">{step.title}</h3>
              <p className="text-sm text-[var(--text-primary)]/50 leading-relaxed">{step.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ============================================================= */
/*  TOOLS GRID                                                   */
/* ============================================================= */

function ToolsSection() {
  return (
    <section className="py-24 md:py-32">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-12">
        <div className="text-center mb-16">
          <p className="text-[var(--accent)] text-sm font-semibold uppercase tracking-widest mb-4">
            Tool Library
          </p>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold mb-4">
            Professional-grade tools,{' '}
            <span className="text-[var(--accent)]">free to start</span>
          </h2>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {TOOLS.map((tool, i) => {
            const Icon = tool.icon
            return (
              <Link
                key={i}
                href="/tools"
                className="group p-5 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-color)] hover:border-[var(--accent)]/20 transition-all no-underline"
              >
                <div className="w-10 h-10 rounded-lg bg-[var(--accent)]/10 flex items-center justify-center mb-4 group-hover:bg-[var(--accent)]/20 transition-colors">
                  <Icon className="w-5 h-5 text-[var(--accent)]" />
                </div>
                <h3 className="font-bold text-[var(--text-primary)] text-sm mb-1">{tool.title}</h3>
                <p className="text-xs text-[var(--text-primary)]/40">{tool.description}</p>
              </Link>
            )
          })}
        </div>
      </div>
    </section>
  )
}

/* ============================================================= */
/*  PRICING                                                      */
/* ============================================================= */

function PricingSection() {
  return (
    <section className="py-24 md:py-32 bg-[var(--bg-secondary)] border-t border-[var(--border-color)]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-12">
        <div className="text-center mb-16">
          <p className="text-[var(--accent)] text-sm font-semibold uppercase tracking-widest mb-4">
            Pricing
          </p>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold mb-4">
            Start free,{' '}
            <span className="text-[var(--accent)]">scale as you grow</span>
          </h2>
          <p className="max-w-xl mx-auto text-[var(--text-primary)]/50 text-base lg:text-lg">
            No hidden fees. Pay via M-Pesa, card, or PayPal.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8 items-start max-w-5xl mx-auto">
          {PRICING.map((plan, i) => (
            <div
              key={i}
              className={`relative p-8 rounded-2xl border transition-all ${
                plan.highlighted
                  ? 'border-[var(--accent)]/50 bg-[var(--bg-primary)] shadow-[0_0_60px_-15px_rgba(209,123,71,0.2)] scale-[1.02]'
                  : 'border-[var(--border-color)] bg-[var(--bg-primary)] hover:border-[var(--border-color)]'
              }`}
            >
              {plan.highlighted && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 bg-[var(--accent)] text-black text-xs font-bold rounded-full uppercase tracking-wider">
                  Most Popular
                </div>
              )}

              <h3 className="text-lg font-bold text-[var(--text-primary)] mb-1">{plan.tier}</h3>
              <p className="text-sm text-[var(--text-primary)]/40 mb-4">{plan.description}</p>
              <div className="flex items-baseline gap-1 mb-6">
                <span className="text-4xl font-bold text-[var(--text-primary)]">{plan.price}</span>
                <span className="text-[var(--text-primary)]/40 text-sm">{plan.period}</span>
              </div>

              <ul className="space-y-3 mb-8">
                {plan.features.map((feature, j) => (
                  <li key={j} className="flex items-start gap-3 text-sm text-[var(--text-primary)]/60">
                    <span className="mt-0.5 text-[var(--accent)]">✓</span>
                    {feature}
                  </li>
                ))}
              </ul>

              <Link
                href={plan.href}
                className={`block text-center py-3.5 rounded-xl font-semibold text-sm transition-all no-underline ${
                  plan.highlighted
                    ? 'bg-[var(--accent)] text-black hover:bg-[var(--accent-dim)]'
                    : 'bg-[var(--bg-tertiary)] text-[var(--text-primary)] border border-[var(--border-color)] hover:bg-[var(--bg-tertiary)]'
                }`}
              >
                {plan.cta}
              </Link>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ============================================================= */
/*  FOOTER                                                       */
/* ============================================================= */

function Footer() {
  return (
    <footer className="border-t border-[var(--border-color)] py-12 bg-[var(--bg-primary)]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-12">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-8">
          <div className="col-span-2">
            <MetarduLogo size={28} showWordmark={true} color="#FFFFFF" />
            <p className="text-sm text-[var(--text-primary)]/40 mt-4 max-w-xs">
              Professional surveying software for East Africa. Built in Nairobi,
              compliant with Survey Act Cap. 299 and RDM 1.1.
            </p>
            <div className="flex items-center gap-4 mt-4">
              <span className="flex items-center gap-1.5 text-xs text-[var(--text-primary)]/30">
                <Smartphone className="w-3.5 h-3.5" /> PWA
              </span>
              <span className="flex items-center gap-1.5 text-xs text-[var(--text-primary)]/30">
                <Cloud className="w-3.5 h-3.5" /> Offline
              </span>
              <span className="flex items-center gap-1.5 text-xs text-[var(--text-primary)]/30">
                <Globe className="w-3.5 h-3.5" /> 14 Languages
              </span>
            </div>
          </div>
          <div>
            <h4 className="text-sm font-semibold text-[var(--text-primary)]/80 mb-3">Product</h4>
            <ul className="space-y-2 text-sm text-[var(--text-primary)]/40">
              <li><Link href="/tools" className="hover:text-[var(--text-primary)] no-underline">Tools</Link></li>
              <li><Link href="/pricing" className="hover:text-[var(--text-primary)] no-underline">Pricing</Link></li>
              <li><Link href="/docs" className="hover:text-[var(--text-primary)] no-underline">Documentation</Link></li>
              <li><Link href="/field" className="hover:text-[var(--text-primary)] no-underline">Field Mode</Link></li>
            </ul>
          </div>
          <div>
            <h4 className="text-sm font-semibold text-[var(--text-primary)]/80 mb-3">Company</h4>
            <ul className="space-y-2 text-sm text-[var(--text-primary)]/40">
              <li><Link href="/help" className="hover:text-[var(--text-primary)] no-underline">Help Center</Link></li>
              <li><Link href="/community" className="hover:text-[var(--text-primary)] no-underline">Community</Link></li>
              <li><Link href="/docs/data-protection" className="hover:text-[var(--text-primary)] no-underline">Privacy</Link></li>
              <li><Link href="/docs/terms" className="hover:text-[var(--text-primary)] no-underline">Terms</Link></li>
            </ul>
          </div>
        </div>
        <div className="pt-8 border-t border-[var(--border-color)] flex flex-col sm:flex-row justify-between items-center gap-4">
          <p className="text-xs text-[var(--text-primary)]/30">
            © {new Date().getFullYear()} METARDU. Survey Act Cap. 299 · RDM 1.1 compliant.
          </p>
          <p className="text-xs text-[var(--text-primary)]/30 font-mono">
            Arc 1960 / UTM 37S · EPSG:21037
          </p>
        </div>
      </div>
    </footer>
  )
}
