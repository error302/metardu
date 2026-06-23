'use client';

import { useState } from 'react';
import { Download } from 'lucide-react';
import SolutionStepsRenderer from '@/components/SolutionStepsRenderer'
import type { SolutionStep } from '@/lib/engine/solution/solutionBuilder'
import { twoPegTestSolved } from '@/lib/engine/solution/wrappers/twoPegTest'
import { PageHeader } from '@/components/shared/PageHeader'
import { generatePDF, downloadCSV, toCSV } from '@/lib/export/helpers'

export default function TwoPegTestCalculator() {
  const [inputs, setInputs] = useState({
    a1: '',  // Staff at A from position 1
    b1: '',  // Staff at B from position 1
    a2: '',  // Staff at A from position 2
    b2: ''   // Staff at B from position 2
  });
  const [steps, setSteps] = useState<SolutionStep[] | null>(null);
  const [calcError, setCalcError] = useState<string | null>(null);
  const [solutionTitle, setSolutionTitle] = useState<string | undefined>(undefined);

  const calculate = () => {
    const A1 = parseFloat(inputs.a1);
    const B1 = parseFloat(inputs.b1);
    const A2 = parseFloat(inputs.a2);
    const B2 = parseFloat(inputs.b2);

    if (isNaN(A1) || isNaN(B1) || isNaN(A2) || isNaN(B2)) return;

    const s = twoPegTestSolved({ A1, B1, A2, B2 })
    setSteps(s.steps)
    setSolutionTitle(s.solution.title)
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <PageHeader
        title="Two Peg Test"
        subtitle="Determine levelling instrument collimation error from two instrument positions"
        reference="Survey Regulations 1994 | Survey Act Cap 299 | RDM 1.1 (2025)"
      />

      <div className="grid md:grid-cols-2 gap-8">
        <div className="card">
          <div className="card-header"><span className="label">Staff Readings</span></div>
          <div className="card-body space-y-4">
            <div className="border-b border-[var(--border-color)] pb-4 mb-4">
              <div className="text-sm text-[var(--text-secondary)] mb-3">Instrument Position 1</div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Staff at A (m)</label>
                  <input className="input" value={inputs.a1} onChange={e => setInputs({...inputs, a1: e.target.value})} placeholder="1.525" />
                </div>
                <div>
                  <label className="label">Staff at B (m)</label>
                  <input className="input" value={inputs.b1} onChange={e => setInputs({...inputs, b1: e.target.value})} placeholder="1.415" />
                </div>
              </div>
            </div>
            <div>
              <div className="text-sm text-[var(--text-secondary)] mb-3">Instrument Position 2</div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Staff at A (m)</label>
                  <input className="input" value={inputs.a2} onChange={e => setInputs({...inputs, a2: e.target.value})} placeholder="1.530" />
                </div>
                <div>
                  <label className="label">Staff at B (m)</label>
                  <input className="input" value={inputs.b2} onChange={e => setInputs({...inputs, b2: e.target.value})} placeholder="1.420" />
                </div>
              </div>
            </div>
            <button onClick={calculate} className="btn btn-primary w-full">Run Two Peg Test</button>
            {steps && (
              <div className="flex gap-2 mt-2">
                <button
                  onClick={() => {
                    generatePDF(
                      { title: 'Two Peg Test Certificate', reference: 'Survey Regulations 1994 | Survey Act Cap 299 | RDM 1.1 (2025)' },
                      [
                        { title: 'Staff Readings', rows: [
                          { label: 'Staff at A (Pos 1)', value: `${inputs.a1} m` },
                          { label: 'Staff at B (Pos 1)', value: `${inputs.b1} m` },
                          { label: 'Staff at A (Pos 2)', value: `${inputs.a2} m` },
                          { label: 'Staff at B (Pos 2)', value: `${inputs.b2} m` },
                        ]},
                        { title: 'Computation Steps', rows: steps.map((s: SolutionStep) => ({ label: s.label, value: s.result || s.computation || '—' })) },
                      ],
                    )
                  }}
                  className="btn btn-secondary flex-1 inline-flex items-center justify-center gap-2"
                >
                  <Download className="w-4 h-4" /> Download PDF
                </button>
                <button
                  onClick={() => {
                    const csv = toCSV(
                      ['Reading', 'Value (m)'],
                      [
                        ['Staff at A (Position 1)', inputs.a1],
                        ['Staff at B (Position 1)', inputs.b1],
                        ['Staff at A (Position 2)', inputs.a2],
                        ['Staff at B (Position 2)', inputs.b2],
                        ...steps.map((s: SolutionStep) => [s.label, s.result || s.computation || '']),
                      ],
                    )
                    downloadCSV(csv, 'two-peg-test-results')
                  }}
                  className="btn btn-secondary flex-1 inline-flex items-center justify-center gap-2"
                >
                  <Download className="w-4 h-4" /> Download CSV
                </button>
              </div>
            )}
          </div>
        </div>

        {steps ? <SolutionStepsRenderer title={solutionTitle} steps={steps} /> : null}
      </div>
    </div>
  );
}
