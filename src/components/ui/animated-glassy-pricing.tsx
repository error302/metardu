import React from 'react';
import Link from 'next/link';
import { FeatureCard } from "@/components/ui/grid-feature-cards";
import { 
  Calculator, FileText, MapPin, Users, 
  Cloud, Download
} from 'lucide-react';

const CheckIcon = ({ className }: { className?: string }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="16" height="16" viewBox="0 0 24 24"
    fill="none" stroke="currentColor" strokeWidth="3"
    strokeLinecap="round" strokeLinejoin="round"
    className={className}
  >
    <path d="M20 6 9 17l-5-5" />
  </svg>
);


export interface PricingCardProps {
  planId: string;
  planName: string;
  description: string;
  price: string;
  features: string[];
  buttonText: string;
  checkoutHref?: string;
  isPopular?: boolean;
  buttonVariant?: 'primary' | 'secondary';
}

export const PricingCard = ({
  planId, planName, description, price, features, buttonText, checkoutHref, isPopular = false, buttonVariant = 'primary'
}: PricingCardProps) => {
  const buttonHref = planId === 'free'
    ? '/register'
    : planId === 'enterprise'
      ? 'mailto:enterprise@metardu.com?subject=METARDU%20Enterprise%20Plan'
      : checkoutHref || `/checkout?plan=${encodeURIComponent(planId)}`;
  const planEyebrow = planId === 'free'
    ? 'Start here'
    : planId === 'pro'
      ? 'For professional surveyors'
      : planId === 'team'
        ? 'For survey crews'
        : planId === 'firm'
          ? 'For established firms'
          : 'Tailored to your operation';
  const cardClasses = `
    relative w-full rounded-[1.35rem] px-6 py-7 flex flex-col transition-all duration-300
    bg-[var(--bg-card)] border border-[var(--border-color)]
    shadow-[0_18px_50px_rgba(0,0,0,0.14)] hover:-translate-y-1 hover:border-[color-mix(in_srgb,var(--accent)_45%,var(--border-color))]
    ${isPopular ? 'md:-translate-y-2 ring-1 ring-[color-mix(in_srgb,var(--accent)_55%,transparent)] bg-[color-mix(in_srgb,var(--accent)_6%,var(--bg-card))] shadow-[0_24px_60px_rgba(0,0,0,0.2)]' : ''}
  `;
  const buttonClasses = `
    mt-auto w-full py-2.5 rounded-xl font-semibold text-[14px] transition font-sans
    ${buttonVariant === 'primary'
      ? 'bg-[var(--accent)] hover:opacity-90 text-black'
      : 'bg-black/10 hover:bg-black/20 text-foreground border border-black/20 dark:bg-white/10 dark:hover:bg-white/20 dark:text-white dark:border-white/20'
    }
  `;

  return (
    <div className={cardClasses.trim()}>
      {isPopular && (
        <div className="absolute -top-3 left-6 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] rounded-md bg-[var(--accent)] text-black">
          Recommended
        </div>
      )}
      <div className="mb-3">
        <p className="text-[10px] uppercase tracking-[0.18em] text-[var(--accent)] font-semibold mb-2">{planEyebrow}</p>
        <h2 className="text-2xl md:text-[30px] font-semibold tracking-[-0.03em] text-[var(--text-primary)]">{planName}</h2>
        <p className="text-sm leading-6 text-[var(--text-secondary)] mt-2">{description}</p>
      </div>
      <div className="my-6 flex items-baseline gap-2 flex-wrap">
        <span className="text-[30px] font-semibold tabular-nums text-[var(--text-primary)] tracking-tight">{price}</span>
        {planId !== 'enterprise' && <span className="text-xs text-[var(--text-muted)]">/month</span>}
      </div>
      <div className="card-divider mb-5 h-px w-full" style={{background: 'linear-gradient(90deg, transparent, var(--border-color) 50%, transparent)'}} />
      <ul className="flex flex-col gap-2.5 text-sm text-[var(--text-secondary)] mb-7">
        {features.map((feature, index) => (
          <li key={`${feature}-${index}`} className="flex items-start gap-2.5 leading-5">
            <CheckIcon className="text-[var(--accent)] w-4 h-4 shrink-0 mt-0.5" /> <span>{feature}</span>
          </li>
        ))}
      </ul>
      <Link href={buttonHref} className={buttonClasses.trim()}>{buttonText}</Link>
    </div>
  );
};


interface ModernPricingPageProps {
  title: React.ReactNode;
  subtitle: React.ReactNode;
  plans: PricingCardProps[];
  children?: React.ReactNode;
}

export const ModernPricingPage = ({
  title,
  subtitle,
  plans,
  children,
}: ModernPricingPageProps) => {
  const metarduFeatures = [
    {
      title: '18+ Survey Tools',
      icon: Calculator,
      description: 'Traverse, leveling, COGO, curves, cross-sections and more built-in.',
    },
    {
      title: 'Professional Reports',
      icon: FileText,
      description: 'Generate PDF plans, bearing schedules, and traverse computations.',
    },
    {
      title: 'GPS Stakeout',
      icon: MapPin,
      description: 'Real-time stakeout mode with Bluetooth total station connection.',
    },
    {
      title: 'Team Collaboration',
      icon: Users,
      description: 'Work together with role-based access and real-time sync.',
    },
    {
      title: 'Cloud Sync',
      icon: Cloud,
      description: 'Your data synced across all devices, online and offline.',
    },
    {
      title: 'Export Anywhere',
      icon: Download,
      description: 'DXF, LandXML, GeoJSON, and CSV export for any workflow.',
    },
  ]

  return (
    <div className="bg-background text-foreground min-h-screen w-full overflow-x-hidden">
      <main className="relative w-full flex flex-col items-center px-4 py-16">
        <div className="w-full max-w-5xl mx-auto text-center mb-10">
          <p className="text-[10px] uppercase tracking-[0.24em] text-[var(--accent)] font-semibold mb-4">METARDU plans</p>
          <h1 className="text-4xl sm:text-5xl md:text-[64px] font-semibold leading-[0.98] tracking-[-0.05em] text-[var(--text-primary)]">
            {title}
          </h1>
          <p className="mt-3 text-[16px] md:text-[20px] text-foreground/80 max-w-2xl mx-auto font-sans">
            {subtitle}
          </p>
        </div>

        <section aria-label="Choose a plan" className="w-full max-w-7xl">
          <div className="grid grid-cols-1 items-stretch gap-5 md:grid-cols-2 xl:grid-cols-3">
            {plans.map((plan) => <PricingCard key={plan.planName} {...plan} />)}
          </div>
        </section>

        <section aria-label="Included METARDU capabilities" className="mt-16 w-full max-w-5xl overflow-hidden rounded-2xl border border-[var(--border-color)] bg-[color-mix(in_srgb,var(--bg-secondary)_45%,transparent)]">
          <div className="grid grid-cols-1 divide-y divide-dashed divide-[var(--border-color)] sm:grid-cols-2 sm:divide-x sm:divide-y-0 lg:grid-cols-3">
            {metarduFeatures.map((feature, i) => (
              <FeatureCard key={`${feature.title}-${i}`} feature={feature} />
            ))}
          </div>
        </section>

        {children}
      </main>
    </div>
  );
};
