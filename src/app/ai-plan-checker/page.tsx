'use client'

import { useState } from 'react'
import {
  checkSurveyPlan,
  getCountryRequirements,
  PlanCheckInput,
  PlanCheckResult
} from '@/lib/marketplace/aiPlanChecker'

export default function AIPlanCheckerPage() {
  const [input, setInput] = useState<PlanCheckInput>({
    projectName: '',
    surveyType: 'traverse',
    country: 'kenya',
    points: [
      { name: 'A', easting: 500000, northing: 9800000 },
      { name: 'B', easting: 500100, northing: 9800000 },
      { name: 'C', easting: 500100, northing: 9800100 },
    ],
    controlPoints: [],
  })
  const [result, setResult] = useState<PlanCheckResult | null>(null)
  const [loading, setLoading] = useState(false)

  const handleCheck = () => {
    setLoading(true)
    setTimeout(() => {
      const res = checkSurveyPlan(input)
      setResult(res)
      setLoading(false)
    }, 500)
  }

  const addPoint = () => {
    setInput({
      ...input,
      points: [...input.points, { name: '', easting: 0, northing: 0 }]
    })
  }

  const updatePoint = (index: number, field: string, value: any) => {
    const newPoints = [...input.points]
    newPoints[index] = { ...newPoints[index], [field]: value }
    setInput({ ...input, points: newPoints })
  }

  const removePoint = (index: number) => {
    const newPoints = input.points.filter((_, i) => i !== index)
    setInput({ ...input, points: newPoints })
  }

  const getGradeColor = (grade: string) => {
    switch (grade) {
      case 'excellent': return 'bg-green-100 text-green-800 border-green-300'
      case 'good': return 'bg-blue-100 text-blue-800 border-blue-300'
      case 'acceptable': return 'bg-yellow-100 text-yellow-800 border-yellow-300'
      case 'needs_revision': return 'bg-orange-100 text-orange-800 border-orange-300'
      case 'failed': return 'bg-red-100 text-red-800 border-red-300'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">AI Plan Checker</h1>
        <p className="text-[var(--text-muted)] mb-8">Automated survey plan validation and compliance checking</p>

        <div className="grid md:grid-cols-2 gap-6">
          <div className="bg-white rounded-xl shadow-sm p-6">
            <h2 className="text-lg font-semibold mb-4">Survey Details</h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-[var(--text-muted)] mb-1">Project Name</label>
                <input
                  type="text"
                  value={input.projectName}
                  onChange={(e) => setInput({ ...input, projectName: e.target.value })}
                  placeholder="Enter project name"
                  className="w-full p-2 border rounded-lg"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-[var(--text-muted)] mb-1">Survey Type</label>
                  <select
                    value={input.surveyType}
                    onChange={(e) => setInput({ ...input, surveyType: e.target.value as any })}
                    className="w-full p-2 border rounded-lg"
                  >
                    <option value="traverse">Traverse</option>
                    <option value="leveling">Leveling</option>
                    <option value="boundary">Boundary</option>
                    <option value="topographic">Topographic</option>
                    <option value="engineering">Engineering</option>
                    <option value="mining">Mining</option>
                    <option value="hydrographic">Hydrographic</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-[var(--text-muted)] mb-1">Country</label>
                  <select
                    value={input.country}
                    onChange={(e) => setInput({ ...input, country: e.target.value as any })}
                    className="w-full p-2 border rounded-lg"
                  >
                    <option value="kenya">Kenya</option>
                    <option value="uganda">Uganda</option>
                    <option value="tanzania">Tanzania</option>
                    <option value="nigeria">Nigeria</option>
                    <option value="ghana">Ghana</option>
                    <option value="south_africa">South Africa</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-[var(--text-muted)] mb-2">Survey Points</label>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {input.points.map((point, i) => (
                    <div key={i} className="flex gap-2 items-center">
                      <input
                        type="text"
                        value={point.name}
                        onChange={(e) => updatePoint(i, 'name', e.target.value)}
                        placeholder="Name"
                        className="w-20 p-2 border rounded-lg"
                      />
                      <input
                        type="number"
                        value={point.easting}
                        onChange={(e) => updatePoint(i, 'easting', Number(e.target.value))}
                        placeholder="Easting"
                        className="w-28 p-2 border rounded-lg"
                      />
                      <input
                        type="number"
                        value={point.northing}
                        onChange={(e) => updatePoint(i, 'northing', Number(e.target.value))}
                        placeholder="Northing"
                        className="w-28 p-2 border rounded-lg"
                      />
                      <button
                        onClick={() => removePoint(i)}
                        className="text-red-500 hover:text-red-700"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
                <button
                  onClick={addPoint}
                  className="mt-2 text-sm text-blue-600 hover:text-blue-700"
                >
                  + Add Point
                </button>
              </div>

              <button
                onClick={handleCheck}
                disabled={loading || !input.projectName}
                className="w-full py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300"
              >
                {loading ? 'Analyzing...' : 'Check Plan'}
              </button>
            </div>
          </div>

          <div className="space-y-6">
            {result && (
              <>
                <div className={`bg-white rounded-xl shadow-sm p-6 border-2 ${getGradeColor(result.grade)}`}>
                  <div className="flex justify-between items-center mb-4">
                    <h2 className="text-lg font-semibold">Analysis Result</h2>
                    <span className="text-2xl font-bold">{result.overallScore}/100</span>
                  </div>
                  <p className="text-lg font-medium mb-2">Grade: {result.grade.toUpperCase()}</p>
                  <p className="text-sm">{result.summary}</p>
                </div>

                {result.issues.length > 0 && (
                  <div className="bg-white rounded-xl shadow-sm p-6">
                    <h3 className="font-semibold mb-4">Issues Found ({result.issues.length})</h3>
                    <div className="space-y-3">
                      {result.issues.map((issue, i) => (
                        <div key={i} className={`p-3 rounded-lg border ${
                          issue.severity === 'error' ? 'bg-red-50 border-red-200' : 'bg-yellow-50 border-yellow-200'
                        }`}>
                          <div className="flex items-start gap-2">
                            <span className={`text-xs px-2 py-0.5 rounded ${
                              issue.severity === 'error' ? 'bg-red-200 text-red-800' : 'bg-yellow-200 text-yellow-800'
                            }`}>
                              {issue.severity.toUpperCase()}
                            </span>
                            <span className="text-xs px-2 py-0.5 rounded bg-gray-200 text-[var(--text-muted)]">
                              {issue.category}
                            </span>
                          </div>
                          <h4 className="font-medium mt-2">{issue.title}</h4>
                          <p className="text-sm text-[var(--text-muted)] mt-1">{issue.description}</p>
                          <p className="text-sm text-blue-700 mt-2">💡 {issue.recommendation}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="bg-white rounded-xl shadow-sm p-6">
                  <h3 className="font-semibold mb-4">Country Requirements</h3>
                  <div className="text-sm text-[var(--text-muted)]">
                    <p><strong>Minimum Precision:</strong> 1:{getCountryRequirements(input.country).precision}</p>
                    <p><strong>Notes:</strong> {getCountryRequirements(input.country).notes}</p>
                  </div>
                </div>
              </>
            )}

            {!result && !loading && (
              <div className="bg-white rounded-xl shadow-sm p-6 text-center text-[var(--text-muted)]">
                <div className="text-4xl mb-3">🤖</div>
                <p>Enter survey details and click "Check Plan" to analyze your survey</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
