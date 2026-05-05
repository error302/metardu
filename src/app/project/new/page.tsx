'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/api-client/client'
import { useRouter } from 'next/navigation'
import { getUTMZoneFromLatLng } from '@/lib/engine/utmZones'
import { useCountry, ALL_COUNTRIES } from '@/lib/country'
import type { SurveyingCountry } from '@/lib/country'
import { SURVEY_TYPE_LABELS, SurveyType } from '@/types/project'
import type { ProjectType } from '@/types/scheme'

export default function NewProjectPage() {
  const { country: defaultCountry, setCountry: setContextCountry } = useCountry()
  const [name, setName] = useState('')
  const [location, setLocation] = useState('')
  const [selectedCountry, setSelectedCountry] = useState<SurveyingCountry>(defaultCountry)
  const [utmZone, setUtmZone] = useState(() => {
    const c = ALL_COUNTRIES.find((c: any) => c.id === defaultCountry)
    return c ? String(c.id === 'us' ? '17' : c.id === 'uk' ? '30' : c.id === 'australia' ? '51' : 37) : '37'
  })
  const [hemisphere, setHemisphere] = useState('S')
  const [surveyType, setSurveyType] = useState<SurveyType>('topographic')
  const [clientName, setClientName] = useState('')
  const [surveyorName, setSurveyorName] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [detecting, setDetecting] = useState(false)

  // Phase 25: Project scale selector
  const [projectType, setProjectType] = useState<ProjectType>('small')
  const [schemeNumber, setSchemeNumber] = useState('')
  const [schemeCounty, setSchemeCounty] = useState('')
  const [schemeSubCounty, setSchemeSubCounty] = useState('')
  const [schemeWard, setSchemeWard] = useState('')
  const [plannedParcels, setPlannedParcels] = useState('')
  const [adjudicationSection, setAdjudicationSection] = useState('')

  const router = useRouter()
  const dbClient = createClient()

  const handleCountryChange = (newCountry: SurveyingCountry) => {
    setSelectedCountry(newCountry)
    const c = ALL_COUNTRIES.find((c: any) => c.id === newCountry)
    if (c) {
      if (c.id === 'us') { setUtmZone('17'); setHemisphere('N') }
      else if (c.id === 'uk') { setUtmZone('30'); setHemisphere('N') }
      else if (c.id === 'australia') { setUtmZone('51'); setHemisphere('S') }
      else if (c.id === 'new_zealand') { setUtmZone('59'); setHemisphere('S') }
      else if (c.id === 'south_africa') { setUtmZone('35'); setHemisphere('S') }
      else if (c.id === 'bahrain') { setUtmZone('39'); setHemisphere('N') }
      else if (c.id === 'nigeria') { setUtmZone('31'); setHemisphere('N') }
      else if (c.id === 'ghana') { setUtmZone('30'); setHemisphere('N') }
      else if (c.id === 'tanzania') { setUtmZone('37'); setHemisphere('S') }
      else if (c.id === 'uganda') { setUtmZone('36'); setHemisphere('N') }
      else if (c.id === 'india') { setUtmZone('44'); setHemisphere('N') }
      else if (c.id === 'indonesia') { setUtmZone('48'); setHemisphere('S') }
      else if (c.id === 'brazil') { setUtmZone('23'); setHemisphere('S') }
      else if (c.id === 'saudi_arabia') { setUtmZone('39'); setHemisphere('N') }
      else if (c.id === 'oman') { setUtmZone('40'); setHemisphere('N') }
      else if (c.id === 'uae') { setUtmZone('40'); setHemisphere('N') }
      else { setUtmZone('37'); setHemisphere('S') }
    }
  }

  const currentCountry = ALL_COUNTRIES.find((c: any) => c.id === selectedCountry)
  const datumLabels: Record<SurveyingCountry, string> = {
    kenya: 'ARC1960',
    uganda: 'ARC1960',
    tanzania: 'ARC1960',
    nigeria: 'Minna',
    ghana: 'Gold Coast 1920',
    south_africa: 'Hartebeesthoek94',
    bahrain: 'Ain Al-Abd 1970',
    saudi_arabia: 'IGM 1969',
    oman: 'OTM / GRS80',
    uae: 'NAD83(CSRS)',
    new_zealand: 'NZGD2000',
    us: 'NAD83(2011)',
    uk: 'OSGB36',
    australia: 'GDA2020',
    india: 'WGS84',
    indonesia: 'WGS84',
    brazil: 'WGS84',
    rwanda: 'ARC1960',
    burundi: 'ARC1960',
    south_sudan: 'ARC1960',
    zambia: 'ARC1960',
    other: 'WGS84',
  }

  const countryStandards: Record<SurveyingCountry, string> = {
    kenya: 'Kenya Reg 168/1994 (R2024)',
    uganda: 'Uganda Survey Regulations',
    tanzania: 'Tanzania Survey Regulations',
    nigeria: 'Nigeria Survey Regulations',
    ghana: 'Ghana Survey Department Standards',
    south_africa: 'South Africa PLATO Standards',
    bahrain: 'Bahrain CSD 2nd Ed 2024',
    saudi_arabia: 'GCC Cadastral Standard',
    oman: 'GCC Cadastral Standard',
    uae: 'GCC Cadastral Standard',
    new_zealand: 'LINZ Rule 8.2',
    us: 'USACE EM 1110-1-1005',
    uk: 'RICS / HMLR',
    australia: 'ICSM Standards',
    india: 'Survey of India Standards',
    indonesia: 'Indonesian Geospatial Standards',
    brazil: 'IBGE / INCRA Standards',
    rwanda: 'Rwanda Land Administration',
    burundi: 'Burundi Cadastre Standards',
    south_sudan: 'South Sudan Survey Regulations',
    zambia: 'Zambia Survey Regulations',
    other: 'National Standard',
  }

  const detectZoneFromGPS = () => {
    if (!navigator.geolocation) {
      setError('GPS not supported in your browser')
      return
    }

    setDetecting(true)
    setError('')

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { zone, hemisphere: hem, description } = getUTMZoneFromLatLng(
          pos.coords.latitude,
          pos.coords.longitude
        )
        setUtmZone(String(zone))
        setHemisphere(hem)
        setDetecting(false)
        setError(`Detected: Zone ${zone}${hem} — ${description}`)
        setTimeout(() => setError(''), 5000)
      },
      () => {
        setDetecting(false)
        setError('Could not get location. Please check GPS permissions.')
      }
    )
  }

  useEffect(() => {
    let mounted = true

    const getUser = async () => {
      const { data: { session } } = await dbClient.auth.getSession()
      if (mounted && session?.user?.email) {
        setSurveyorName(session.user.email)
      }
    }

    void getUser()

    return () => { mounted = false }
  }, [dbClient])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    const { data: { session } } = await dbClient.auth.getSession()
    if (!session?.user) {
      window.location.replace('/login?next=%2Fproject%2Fnew')
      return
    }

    // Insert project with project_type
    const projectPayload: Record<string, any> = {
      name,
      location,
      utm_zone: parseInt(utmZone),
      hemisphere,
      user_id: session.user.id,
      survey_type: surveyType,
      client_name: clientName || null,
      surveyor_name: surveyorName || session.user.email,
      country: selectedCountry,
      datum: datumLabels[selectedCountry],
      project_type: projectType,
    }

    const { data: project, error: insertError } = await dbClient.from('projects').insert(projectPayload).single()

    if (insertError) {
      setError(insertError.message)
      setLoading(false)
      return
    }

    // If scheme, also insert scheme_details and redirect to scheme workspace
    if (projectType === 'scheme') {
      const schemePayload = {
        project_id: project.id,
        scheme_number: schemeNumber || null,
        county: schemeCounty || null,
        sub_county: schemeSubCounty || null,
        ward: schemeWard || null,
        planned_parcels: plannedParcels ? parseInt(plannedParcels) : 0,
        adjudication_section: adjudicationSection || null,
      }

      const { error: schemeError } = await dbClient.from('scheme_details').insert(schemePayload)

      if (schemeError) {
        setError(`Project created but scheme details failed: ${schemeError.message}`)
        setLoading(false)
        // Still navigate — project was created
      }
    }

    setContextCountry(selectedCountry)

    if (projectType === 'scheme') {
      router.push(`/project/${project.id}/scheme`)
    } else {
      router.push(`/project/${project.id}`)
    }
  }

  const zoneDescriptions: Record<number, string> = {
    28: 'West Africa',
    29: 'West Africa',
    30: 'West Africa / UK',
    31: 'West Africa / Europe',
    32: 'East Africa / Europe',
    33: 'East Africa / Europe',
    34: 'East Africa / Middle East',
    35: 'East Africa',
    36: 'East Africa / Middle East',
    37: 'East Africa (Kenya, Uganda, Tanzania)',
    38: 'East Africa / Arabia',
    39: 'East Africa / Arabia',
    40: 'East Africa / South Asia',
  }

  const kenyaCounties = [
    'Mombasa', 'Kilifi', 'Kwale', 'Lamu', 'Tana River', 'Taita Taveta',
    'Garissa', 'Wajir', 'Mandera', 'Marsabit', 'Isiolo', 'Meru',
    'Tharaka Nithi', 'Embu', 'Kitui', 'Machakos', 'Makueni', 'Nyandarua',
    'Nyeri', 'Kirinyaga', 'Muranga', 'Kiambu', 'Turkana', 'West Pokot',
    'Samburu', 'Trans Nzoia', 'Uasin Gishu', 'Elgeyo Marakwet', 'Nandi',
    'Baringo', 'Laikipia', 'Nakuru', 'Narok', 'Kajiado', 'Kericho',
    'Bomet', 'Kakamega', 'Vihiga', 'Bungoma', 'Busia', 'Siaya',
    'Kisumu', 'Homa Bay', 'Migori', 'Kisii', 'Nyamira', 'Nairobi',
  ]

  const inputClass = 'w-full px-4 py-3 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-lg text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)] focus:outline-none transition-colors text-sm'
  const selectClass = inputClass
  const labelClass = 'block text-sm font-medium text-[var(--text-secondary)] mb-1.5'

  return (
    <div className="min-h-[calc(100vh-8rem)] bg-[var(--bg-primary)]">
      <main className="max-w-2xl mx-auto px-4 py-10">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm text-[var(--text-muted)] mb-6">
          <Link href="/dashboard" className="hover:text-[var(--accent)] transition-colors">Dashboard</Link>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          <span className="text-[var(--text-primary)]">New Project</span>
        </div>

        {/* Title */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-[var(--text-primary)] mb-1">Create New Project</h1>
          <p className="text-sm text-[var(--text-secondary)]">Set up your survey project parameters and coordinate system.</p>
        </div>

        {/* Error / Success Banner */}
        {error && (
          <div className={`mb-6 p-3.5 border rounded-lg text-sm flex items-start gap-2 ${
            error.startsWith('Detected')
              ? 'bg-green-900/20 border-green-500/30 text-green-400'
              : 'bg-red-900/20 border-red-500/30 text-red-400'
          }`}>
            <svg className="w-5 h-5 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              {error.startsWith('Detected') ? (
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
              )}
            </svg>
            {error}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-6">

          {/* Phase 25: Project Scale Toggle */}
          <div>
            <label className={labelClass}>
              Project Scale <span className="text-[var(--accent)]">*</span>
            </label>
            <div className="grid grid-cols-2 gap-0 rounded-lg border border-[var(--border-color)] overflow-hidden">
              <button
                type="button"
                onClick={() => setProjectType('small')}
                className={`py-3.5 px-4 text-sm font-medium transition-all flex flex-col items-center gap-1 ${
                  projectType === 'small'
                    ? 'bg-[var(--accent)] text-black'
                    : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]'
                }`}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m3.75 9v6m3-3H9m1.5-12H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                </svg>
                <span>Small Project</span>
                <span className="text-[10px] opacity-70">Individual parcel / site</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setProjectType('scheme')
                  // Auto-set cadastral for schemes
                  setSurveyType('cadastral')
                }}
                className={`py-3.5 px-4 text-sm font-medium transition-all flex flex-col items-center gap-1 ${
                  projectType === 'scheme'
                    ? 'bg-orange-500 text-white'
                    : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]'
                }`}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
                </svg>
                <span>Scheme / Large Project</span>
                <span className="text-[10px] opacity-70">Subdivision, adjudication</span>
              </button>
            </div>
            {projectType === 'scheme' && (
              <p className="mt-2 text-xs text-orange-400">
                Scheme mode enables blocks, parcel management, batch deed plans, and Registry Index Maps.
              </p>
            )}
          </div>

          {/* Project Name */}
          <div>
            <label className={labelClass}>
              Project Name <span className="text-[var(--accent)]">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={inputClass}
              required
              placeholder={projectType === 'scheme' ? 'e.g., Mwavumbo Ward Cadastral Subdivision' : 'e.g., Karen Estate Boundary Survey'}
              autoFocus
            />
          </div>

          {/* Location / Description */}
          <div>
            <label className={labelClass}>Location / Description</label>
            <textarea
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              className={`${inputClass} h-20 resize-none`}
              placeholder={projectType === 'scheme' ? 'e.g., Mariakani, Kilifi County' : 'e.g., Mombasa, along Diani Beach Road'}
            />
          </div>

          {/* Phase 25: Scheme-specific fields */}
          {projectType === 'scheme' && (
            <div className="p-5 bg-orange-500/5 border border-orange-500/20 rounded-xl space-y-4">
              <h3 className="text-sm font-semibold text-[var(--text-primary)] flex items-center gap-2">
                <svg className="w-4 h-4 text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 21v-7.5a.75.75 0 01.75-.75h3a.75.75 0 01.75.75V21m-4.5 0H2.36m11.14 0H18m0 0h3.64m-1.39 0V9.349m-16.5 11.65V9.35m0 0a3.001 3.001 0 003.75-.615A2.993 2.993 0 009.75 9.75c.896 0 1.7-.393 2.25-1.016a2.993 2.993 0 002.25 1.016c.896 0 1.7-.393 2.25-1.016a3.001 3.001 0 003.75.614m-16.5 0a3.004 3.004 0 01-.621-4.72L4.318 3.44A1.5 1.5 0 015.378 3h13.243a1.5 1.5 0 011.06.44l1.19 1.189a3 3 0 01-.621 4.72m-13.5 8.65h3.75a.75.75 0 00.75-.75V13.5a.75.75 0 00-.75-.75H6.75a.75.75 0 00-.75.75v3.15c0 .415.336.75.75.75z" />
                </svg>
                Scheme Details
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">Scheme Number</label>
                  <input
                    type="text"
                    value={schemeNumber}
                    onChange={(e) => setSchemeNumber(e.target.value)}
                    className={inputClass}
                    placeholder="e.g., CRS/MWK/001/2026"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">Adjudication Section</label>
                  <input
                    type="text"
                    value={adjudicationSection}
                    onChange={(e) => setAdjudicationSection(e.target.value)}
                    className={inputClass}
                    placeholder="e.g., Mwavumbo Section"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">County <span className="text-orange-400">*</span></label>
                  <select
                    value={schemeCounty}
                    onChange={(e) => setSchemeCounty(e.target.value)}
                    className={selectClass}
                  >
                    <option value="">Select county</option>
                    {kenyaCounties.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">Sub-County</label>
                  <input
                    type="text"
                    value={schemeSubCounty}
                    onChange={(e) => setSchemeSubCounty(e.target.value)}
                    className={inputClass}
                    placeholder="e.g., Mariakani"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">Ward</label>
                  <input
                    type="text"
                    value={schemeWard}
                    onChange={(e) => setSchemeWard(e.target.value)}
                    className={inputClass}
                    placeholder="e.g., Mwavumbo"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">Planned Parcels</label>
                <input
                  type="number"
                  value={plannedParcels}
                  onChange={(e) => setPlannedParcels(e.target.value)}
                  className={inputClass}
                  min={1}
                  placeholder="e.g., 250"
                />
              </div>
            </div>
          )}

          {/* UTM Zone + Hemisphere */}
          <div>
            <label className={labelClass}>UTM Zone (1-60)</label>
            <div className="grid grid-cols-2 gap-4">
              <div className="relative">
                <input
                  type="number"
                  value={utmZone}
                  onChange={(e) => setUtmZone(e.target.value)}
                  className={inputClass}
                  min={1}
                  max={60}
                  required
                />
                {zoneDescriptions[parseInt(utmZone)] && (
                  <p className="text-[var(--accent)] text-xs mt-1.5 font-medium">
                    {zoneDescriptions[parseInt(utmZone)]}
                  </p>
                )}
              </div>

              <div>
                <div className="flex rounded-lg border border-[var(--border-color)] overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setHemisphere('N')}
                    className={`flex-1 py-3 text-sm font-medium transition-colors ${
                      hemisphere === 'N'
                        ? 'bg-[var(--accent)] text-black'
                        : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    N — Northern
                  </button>
                  <button
                    type="button"
                    onClick={() => setHemisphere('S')}
                    className={`flex-1 py-3 text-sm font-medium transition-colors ${
                      hemisphere === 'S'
                        ? 'bg-[var(--accent)] text-black'
                        : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    S — Southern
                  </button>
                </div>
              </div>
            </div>

            {/* GPS Detect */}
            <button
              type="button"
              onClick={detectZoneFromGPS}
              disabled={detecting}
              className="mt-2 text-xs text-[var(--text-muted)] hover:text-[var(--accent)] flex items-center gap-1.5 transition-colors disabled:opacity-50"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
              </svg>
              {detecting ? 'Detecting...' : 'Detect zone from GPS'}
            </button>
          </div>

          {/* Country */}
          <div>
            <label className={labelClass}>Country / Jurisdiction</label>
            <select
              value={selectedCountry}
              onChange={(e) => handleCountryChange(e.target.value as SurveyingCountry)}
              className={selectClass}
            >
              {ALL_COUNTRIES.map((c: any) => (
                <option key={c.id} value={c.id}>{c.flag} {c.name}</option>
              ))}
            </select>
            {currentCountry && (
              <div className="mt-2 p-3 bg-[var(--bg-tertiary)] rounded-lg border border-[var(--border-color)]/50 text-xs text-[var(--text-secondary)] space-y-0.5">
                <div className="flex items-center gap-1.5">
                  <span className="text-[var(--accent)] font-semibold">{currentCountry.flag} {currentCountry.name}</span>
                </div>
                <div>Datum: <span className="text-[var(--text-primary)]">{datumLabels[selectedCountry]}</span></div>
                <div>Standard: <span className="text-[var(--text-primary)]">{countryStandards[selectedCountry]}</span></div>
              </div>
            )}
          </div>

          {/* Survey Type */}
          <div>
            <label className={labelClass}>Survey Type</label>
            <select
              value={surveyType}
              onChange={(e) => setSurveyType(e.target.value as SurveyType)}
              className={selectClass}
            >
              {(Object.entries(SURVEY_TYPE_LABELS) as [SurveyType, string][]).map(
                ([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                )
              )}
            </select>
          </div>

          {/* Client + Surveyor */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Client Name</label>
              <input
                type="text"
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                className={inputClass}
                placeholder="e.g., Kilifi County Government"
              />
            </div>

            <div>
              <label className={labelClass}>Surveyor Name</label>
              <input
                type="text"
                value={surveyorName}
                onChange={(e) => setSurveyorName(e.target.value)}
                className={inputClass}
                placeholder="Your name or company"
              />
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3 pt-4 border-t border-[var(--border-color)]">
            <Link
              href="/dashboard"
              className="px-5 py-2.5 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-[var(--border-color)] rounded-lg hover:border-[var(--border-hover)] transition-colors"
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={loading || !name.trim()}
              className="flex-1 sm:flex-none sm:px-8 py-2.5 bg-[var(--accent)] hover:bg-[var(--accent-dim)] text-black text-sm font-semibold rounded-lg transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {loading ? (
                <span className="inline-flex items-center gap-2">
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Creating...
                </span>
              ) : (
                projectType === 'scheme' ? 'Create Scheme Project' : 'Create Project'
              )}
            </button>
          </div>
        </form>

        {/* UTM Reference Card */}
        <div className="mt-10 p-5 bg-[var(--bg-card)] rounded-xl border border-[var(--border-color)]">
          <h3 className="text-[var(--text-secondary)] text-sm font-semibold mb-3 flex items-center gap-2">
            <svg className="w-4 h-4 text-[var(--accent)]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
            </svg>
            UTM Zone Reference
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            {[
              { zones: '28–30', region: 'West Africa' },
              { zones: '31–32', region: 'Central Africa' },
              { zones: '33–36', region: 'East Africa' },
              { zones: '37', region: 'Kenya / Uganda / TZ' },
              { zones: '10–19', region: 'USA' },
              { zones: '42–46', region: 'South Asia' },
              { zones: '46–54', region: 'SE Asia' },
              { zones: '49–56', region: 'Australia' },
            ].map((item) => (
              <div key={item.region} className="flex items-baseline gap-1.5 text-[var(--text-muted)]">
                <span className="text-[var(--accent)] font-semibold">{item.zones}</span>
                <span>{item.region}</span>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  )
}
