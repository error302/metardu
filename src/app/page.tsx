import Link from 'next/link'
import Image from 'next/image'
import { ChevronDown } from 'lucide-react'
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
  {
    q: 'Can I use METARDU outside Kenya?',
    a: 'You can run field capture, traverse, levelling, and mapping workflows in a supported project grid. Confirm the coordinate reference, vertical datum, instrument and export format for the job. For cadastral submission, verify the applicable local requirements with the responsible authority.',
  },
]

export default function LandingPage() {
  return (
    <div className={styles.landing}>
      <HeroSection />
      <WorkflowSection />
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
          <h1 id="landing-title" className={styles.heroTitle}>
            Field evidence in.{' '}<span className={styles.heroAccent}>Checked drawings out.</span>
          </h1>
          <p className={styles.heroLead}>
            Keep observations, traverse and levelling computations, maps, and draft outputs together in one survey project, from control to checked deliverable.
          </p>
          <div className={styles.heroActions}>
            <Link href="/demo" prefetch={false} className={styles.primaryAction}>
              Try the guided demo <span aria-hidden>↗</span>
            </Link>
            <Link href="/register" prefetch={false} className={styles.secondaryAction}>
              Create an account <span aria-hidden>↗</span>
            </Link>
          </div>
          <p className={styles.heroNote}>Try a sample parcel without an account. <Link href="/install" prefetch={false} className="underline underline-offset-4">Install METARDU</Link></p>
        </div>

        <figure className={styles.heroPhoto}>
          <div className={styles.heroPhotoFrame}>
            <Image
              src="/landing/product-survey-review.webp"
              alt="METARDU's adjusted boundary view with five labeled beacons, a north arrow, and a scale bar."
              fill
              priority
              fetchPriority="high"
              sizes="(max-width: 600px) calc(100vw - 2rem), (max-width: 808px) calc(100vw - 3rem), (max-width: 900px) 760px, (max-width: 1368px) 44vw, 580px"
              className={styles.heroPhotoImage}
            />
          </div>
          <figcaption className={styles.photoCredit}>
            Adjusted boundary in METARDU’s guided practice survey.
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
          <Link href="/field" prefetch={false} className={styles.workflowLink}>Explore field workflows <span aria-hidden>↗</span></Link>
        </div>

        <figure className={styles.workflowPhoto}>
          <div className={styles.workflowPhotoFrame}>
            <Image
              src="/landing/field-levelling.webp"
              alt="A digital level on a tripod while a field technician holds a levelling staff in open ground."
              fill
              loading="lazy"
              sizes="(max-width: 600px) calc(100vw - 2rem), (max-width: 900px) 46vw, (max-width: 1368px) 42vw, 548px"
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
      <div className={styles.planLink}><Link href="/pricing" prefetch={false}>View plans and pricing</Link></div>
    </section>
  )
}
