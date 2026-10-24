import Link from 'next/link'
import Image from 'next/image'
import { ChevronDown } from 'lucide-react'
import { PricingSection } from '@/components/landing/PricingSection'
import { PLAN_CATALOG } from '@/lib/subscription/catalog'
import styles from './landing.module.css'

const WORKFLOW_STEPS = [
  {
    number: '01',
    title: 'Set up the job',
    description: 'Record the project details, reference system, units, and known control before processing measurements.',
  },
  {
    number: '02',
    title: 'Bring in observations',
    description: 'Capture or import field records, then run the appropriate traverse, levelling, or coordinate geometry workflow.',
  },
  {
    number: '03',
    title: 'Review and prepare outputs',
    description: 'Check the source and results, then prepare draft drawings, schedules, or reports for professional review.',
  },
]

const FAQS = [
  {
    q: 'Are METARDU drawings certified or automatically accepted?',
    a: 'No. A generated drawing or report is a draft. A qualified surveyor must verify the source evidence, control, calculations, geometry, and current submission requirements before signing or submitting work.',
  },
  {
    q: 'Can I use METARDU without internet?',
    a: 'Some local calculations and previously cached field tools can work offline. Project saving, synchronization, and server-generated documents need a connection. Test the exact workflow and confirm the data is saved before leaving coverage.',
  },
  {
    q: 'Which coordinate reference systems are available?',
    a: 'METARDU includes Arc 1960 / UTM 36S and 37S, registered WGS 84 / UTM grids, and selected Cassini-Soldner conversions. Availability depends on a supported CRS definition. Verify the job grid, datum, and units before computing.',
  },
]

const proPriceKes = (() => {
  const plan = PLAN_CATALOG.find((item) => item.id === 'pro')
  if (!plan) throw new Error('Pro plan is missing from the subscription catalog')
  return plan.prices.KES
})()

export default function LandingPage() {
  return (
    <div className={styles.landing}>
      <HeroSection />
      <WorkflowSection />
      <PricingSection />
      <FAQSection />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'SoftwareApplication',
            name: 'METARDU',
            applicationCategory: 'BusinessApplication',
            operatingSystem: 'Web',
            offers: {
              '@type': 'Offer',
              price: proPriceKes.toString(),
              priceCurrency: 'KES',
              url: 'https://metardu.space/checkout?plan=pro',
            },
            areaServed: 'KE',
            featureList: [
              'Survey project and field record management',
              'Survey computation and review workflows',
              'Draft mapping and document exports',
            ],
          }),
        }}
      />
    </div>
  )
}

function HeroSection() {
  return (
    <section aria-labelledby="landing-title" className={styles.hero}>
      <div className={styles.heroGrid}>
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}>Survey work, field to finish</p>
          <h1 id="landing-title" className={styles.heroTitle}>
            Keep the evidence.<em>Move the work forward.</em>
          </h1>
          <p className={styles.heroLead}>
            Keep field evidence, computations, maps, and draft outputs together in one survey project.
          </p>
          <div className={styles.heroActions}>
            <Link href="/dashboard" className={styles.primaryAction}>
              Open dashboard <span aria-hidden>→</span>
            </Link>
            <Link href="/register" className={styles.secondaryAction}>
              Create an account <span aria-hidden>↗</span>
            </Link>
          </div>
          <p className={styles.heroNote}>Your dashboard opens projects, field records, maps, and drawings. <Link href="/demo" className="underline underline-offset-4">Try the interactive sample</Link> with synthetic data before signing in.</p>
        </div>

        <figure className={styles.heroPhoto}>
          <div className={styles.heroPhotoFrame}>
            <Image
              src="/landing/hero-survey.webp"
              alt="A total station set up beneath a bridge for a topographic survey."
              fill
              priority
              sizes="(max-width: 900px) 100vw, 48vw"
              className={styles.heroPhotoImage}
            />
            <span className={styles.photoLabel}>Reference fieldwork / total station</span>
          </div>
          <figcaption className={styles.photoCredit}>
            Reference bridge survey photograph by{' '}
            <a href="https://commons.wikimedia.org/wiki/File:Topographic_survey_of_a_bridge.jpg" target="_blank" rel="noreferrer">FedericaGaspari</a>
            {' · '}
            <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noreferrer">CC BY-SA 4.0</a>
            {' · resized for display'}
          </figcaption>
        </figure>
      </div>
    </section>
  )
}

function WorkflowSection() {
  return (
    <section id="workflow" aria-labelledby="workflow-heading" className={styles.workflow}>
      <div className={styles.workflowInner}>
        <div className={styles.workflowCopy}>
          <p className={styles.sectionEyebrow}>The survey workflow</p>
          <h2 id="workflow-heading" className={styles.workflowTitle}>One project, from control to checked output.</h2>
          <ol className={styles.workflowSteps}>
            {WORKFLOW_STEPS.map((step) => (
              <li className={styles.workflowStep} key={step.number}>
                <span className={styles.workflowNumber}>{step.number}</span>
                <div>
                  <h3>{step.title}</h3>
                  <p>{step.description}</p>
                </div>
              </li>
            ))}
          </ol>
          <Link href="/field" className={styles.workflowLink}>Explore field workflows <span aria-hidden>↗</span></Link>
        </div>

        <figure className={styles.workflowPhoto}>
          <div className={styles.workflowPhotoFrame}>
            <Image
              src="/landing/field-levelling.webp"
              alt="A digital level on a tripod while a field technician holds a levelling staff in open ground."
              fill
              sizes="(max-width: 900px) 100vw, 42vw"
              className={styles.workflowPhotoImage}
            />
          </div>
          <figcaption className={styles.photoCredit}>
            Reference field levelling photograph by{' '}
            <a href="https://commons.wikimedia.org/wiki/File:Survey_level_and_field_technician.jpg" target="_blank" rel="noreferrer">Cvstr / HR Surveyors</a>
            {' · '}
            <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">CC BY 4.0</a>
            {' · resized for display'}
          </figcaption>
        </figure>
      </div>
    </section>
  )
}

function FAQSection() {
  return (
    <section aria-labelledby="faq-heading" className={styles.faq}>
      <div className={styles.faqInner}>
        <div className={styles.faqHeading}>
          <p className={styles.sectionEyebrow}>Before you start</p>
          <h2 id="faq-heading">Clear answers for survey teams.</h2>
        </div>
        <ul className={styles.faqList}>
          {FAQS.map((faq) => (
            <li key={faq.q}>
              <details className={styles.faqItem}>
                <summary>
                  <span>{faq.q}</span>
                  <ChevronDown className={styles.faqChevron} aria-hidden />
                </summary>
                <p>{faq.a}</p>
              </details>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
