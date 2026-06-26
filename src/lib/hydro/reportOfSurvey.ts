/**
 * Report of Survey (RoS) Generator — Phase 19
 * Required document per IHO S-44 Section 1.4
 * Kenya-specific fields per Survey Act Cap 299
 */

export interface ReportOfSurveyData {
  projectName:      string
  hydroType:        string
  startDate:        string
  endDate:          string
  surveyArea:       string
  county:           string
  datum:            string
  tideGaugeRef:     string
  vesselName:       string
  sounderModel:     string
  soundingCount:    number
  meanDepthM:       number
  maxDepthM:        number
  minDepthM:        number
  weatherSummary:   string
  interruptions:   string
  equipmentNotes:   string
  surveyorName:     string
  registrationNo:   string
  firmName:         string
  reportDate:       string
}

export interface ReportSection {
  title: string
  content: string
}

export function buildReportOfSurveyContent(
  data: ReportOfSurveyData
): { sections: ReportSection[] } {
  return {
    sections: [
      {
        title: 'REPUBLIC OF KENYA — REPORT OF SURVEY',
        content: [
          `Survey Project: ${data.projectName}`,
          `Survey Type: ${data.hydroType.replace('_', ' ').toUpperCase()}`,
          `Survey Area: ${data.surveyArea}, ${data.county}`,
          `Datum: ${data.datum}`,
          `Coordinate System: Arc 1960 / UTM Zone 37S`,
          `Tide Gauge Reference: ${data.tideGaugeRef}`,
        ].join('\n')
      },
      {
        title: '1. OPERATIONAL DETAILS',
        content: [
          `Survey Start: ${data.startDate}`,
          `Survey End: ${data.endDate}`,
          `Survey Vessel: ${data.vesselName || 'Not specified'}`,
          `Sounding Equipment: ${data.sounderModel || 'Not specified'}`,
          `Total Soundings Acquired: ${data.soundingCount}`,
        ].join('\n')
      },
      {
        title: '2. DEPTH SUMMARY',
        content: [
          `Mean Depth (reduced): ${data.meanDepthM.toFixed(2)} m`,
          `Maximum Depth: ${data.maxDepthM.toFixed(2)} m`,
          `Minimum Depth: ${data.minDepthM.toFixed(2)} m`,
          `Datum: ${data.datum}`,
        ].join('\n')
      },
      {
        title: '3. WEATHER AND SEA CONDITIONS',
        content: data.weatherSummary || 'No weather observations recorded.'
      },
      {
        title: '4. INTERRUPTIONS AND EXTRANEOUS ACTIVITIES',
        content: data.interruptions || 'No interruptions recorded.'
      },
      {
        title: '5. EQUIPMENT AND CALIBRATION NOTES',
        content: data.equipmentNotes || 'No equipment notes recorded.'
      },
      {
        title: '6. SURVEYOR CERTIFICATION',
        content: [
          `I certify that this survey was conducted in accordance with the`,
          `Survey Act Cap 299 and IHO S-44 (6th edition) standards.`,
          ``,
          `Licensed Surveyor: ${data.surveyorName}`,
          `Registration No: ${data.registrationNo}`,
          `Firm: ${data.firmName}`,
          `Date: ${data.reportDate}`,
        ].join('\n')
      }
    ]
  }
}
