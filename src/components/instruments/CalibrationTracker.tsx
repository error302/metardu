'use client';

import React, { useState, useMemo } from 'react';
import { CalibrationRecord, computeCollimation, computeEDMBaseline, checkCalibrationStatus } from '../../lib/calibration/calibrationEngine';

interface CalibrationTrackerProps {
  equipmentList?: Array<{ id: string; name: string; type: string }>;
  onCalibrationAdded?: (record: CalibrationRecord) => void;
}

export function CalibrationTracker({ equipmentList = [], onCalibrationAdded }: CalibrationTrackerProps) {
  const [records, setRecords] = useState<CalibrationRecord[]>([]);

  // Wizard States
  const [flHz, setFlHz] = useState<string>('');
  const [frHz, setFrHz] = useState<string>('');

  const [measuredLegs, setMeasuredLegs] = useState<string>('');
  const [certifiedLegs, setCertifiedLegs] = useState<string>('');

  // Form State
  const [showAddForm, setShowAddForm] = useState(false);
  const [formEquip, setFormEquip] = useState('');
  const [formType, setFormType] = useState<'collimation' | 'edm_baseline' | 'tilt_sensor' | 'bubble' | 'optical_plummet' | 'full_service'>('collimation');
  const [formDate, setFormDate] = useState('');
  const [formDueDate, setFormDueDate] = useState('');
  const [formPassed, setFormPassed] = useState(true);
  const [formNotes, setFormNotes] = useState('');

  const summary = useMemo(() => checkCalibrationStatus(records), [records]);

  const collimationResult = useMemo(() => {
    const fl = parseFloat(flHz);
    const fr = parseFloat(frHz);
    if (!isNaN(fl) && !isNaN(fr)) {
      return computeCollimation(fl, fr);
    }
    return null;
  }, [flHz, frHz]);

  const edmResult = useMemo(() => {
    try {
      const ms = measuredLegs.split(',').map(s => parseFloat(s.trim())).filter(n => !isNaN(n));
      const cs = certifiedLegs.split(',').map(s => parseFloat(s.trim())).filter(n => !isNaN(n));
      if (ms.length > 0 && ms.length === cs.length) {
        return computeEDMBaseline(ms, cs);
      }
    } catch (e) {
      // Ignore
    }
    return null;
  }, [measuredLegs, certifiedLegs]);

  const isCollimationPass = collimationResult ? Math.abs(collimationResult.twoC) < 20 : false;

  const handleAddCalibration = (e: React.FormEvent) => {
    e.preventDefault();
    const equip = equipmentList.find(eq => eq.id === formEquip);
    
    if (!equip) return;

    const newRecord: CalibrationRecord = {
      id: crypto.randomUUID(),
      equipmentId: equip.id,
      equipmentName: equip.name,
      equipmentType: equip.type as any,
      calibrationType: formType,
      date: formDate,
      nextDueDate: formDueDate,
      performedBy: 'Internal Staff', // default or ask in form
      results: { passed: formPassed },
      status: 'current',
      notes: formNotes
    };

    setRecords(prev => [newRecord, ...prev]);
    onCalibrationAdded?.(newRecord);
    setShowAddForm(false);
  };

  return (
    <div className="space-y-8 bg-slate-900 text-slate-100 rounded-xl shadow-lg border border-slate-800 p-6">
      
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Calibration & Maintenance Tracking</h2>
        <button 
          onClick={() => setShowAddForm(!showAddForm)}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded shadow text-sm font-medium transition-colors"
        >
          {showAddForm ? 'Cancel' : '+ Add Calibration'}
        </button>
      </div>

      {/* Summary Banner */}
      {(summary.overdue > 0 || summary.expired > 0 || summary.dueSoon > 0) && (
        <div className={`p-4 rounded-lg font-semibold ${(summary.overdue > 0 || summary.expired > 0) ? 'bg-red-900/50 text-red-400 border border-red-800' : 'bg-amber-900/50 text-amber-400 border border-amber-800'}`}>
          {(summary.overdue > 0 || summary.expired > 0) ? `Alert: ${summary.overdue + summary.expired} instrument(s) overdue for calibration!` : `Notice: ${summary.dueSoon} instrument(s) due soon for calibration.`}
        </div>
      )}

      {/* Add Form */}
      {showAddForm && (
        <form onSubmit={handleAddCalibration} className="bg-slate-800 p-5 rounded-lg border border-slate-700 space-y-4">
          <h3 className="text-lg font-medium text-slate-200 border-b border-slate-700 pb-2">New Calibration Record</h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-slate-400 mb-1">Equipment</label>
              <select required className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-slate-200" value={formEquip} onChange={e => setFormEquip(e.target.value)}>
                <option value="">Select Equipment...</option>
                {equipmentList.map(eq => <option key={eq.id} value={eq.id}>{eq.name}</option>)}
              </select>
            </div>
            
            <div>
              <label className="block text-sm text-slate-400 mb-1">Calibration Type</label>
              <select className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-slate-200" value={formType} onChange={e => setFormType(e.target.value as any)}>
                <option value="collimation">Collimation (2C)</option>
                <option value="edm_baseline">EDM Baseline</option>
                <option value="tilt_sensor">Tilt Sensor</option>
                <option value="bubble">Circular Bubble</option>
                <option value="optical_plummet">Optical Plummet</option>
                <option value="full_service">Full Service</option>
              </select>
            </div>

            <div>
              <label className="block text-sm text-slate-400 mb-1">Date Performed</label>
              <input required type="date" className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-slate-200" value={formDate} onChange={e => setFormDate(e.target.value)} />
            </div>

            <div>
              <label className="block text-sm text-slate-400 mb-1">Next Due Date</label>
              <input required type="date" className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-slate-200" value={formDueDate} onChange={e => setFormDueDate(e.target.value)} />
            </div>

            <div className="md:col-span-2">
              <label className="flex items-center space-x-2 text-sm text-slate-300">
                <input type="checkbox" className="form-checkbox bg-slate-950 border-slate-700 text-blue-500 rounded" checked={formPassed} onChange={e => setFormPassed(e.target.checked)} />
                <span>Passed / Within Tolerance</span>
              </label>
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm text-slate-400 mb-1">Notes / Results</label>
              <input type="text" className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-slate-200" value={formNotes} onChange={e => setFormNotes(e.target.value)} placeholder="e.g. 2C error: 12&quot;" />
            </div>
          </div>
          
          <div className="flex justify-end pt-2">
            <button type="submit" className="bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2 rounded shadow font-medium transition-colors">
              Save Record
            </button>
          </div>
        </form>
      )}

      {/* Wizards Section */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        
        {/* Collimation Wizard */}
        <div className="p-5 bg-slate-800 rounded-lg border border-slate-700 space-y-4 shadow-sm">
          <h3 className="text-lg font-semibold text-slate-200">Collimation Check (ISO 17123-3)</h3>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-slate-400 mb-1">Face Left Hz (°)</label>
              <input type="number" step="any" className="w-full bg-slate-950 border border-slate-700 rounded p-2.5 text-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500" value={flHz} onChange={e => setFlHz(e.target.value)} placeholder="e.g. 0.0012" />
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">Face Right Hz (°)</label>
              <input type="number" step="any" className="w-full bg-slate-950 border border-slate-700 rounded p-2.5 text-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500" value={frHz} onChange={e => setFrHz(e.target.value)} placeholder="e.g. 180.0016" />
            </div>
          </div>

          {collimationResult && (
            <div className={`mt-5 p-4 rounded-lg flex items-center justify-between border shadow-inner ${isCollimationPass ? 'bg-emerald-900/30 border-emerald-800/50' : 'bg-red-900/30 border-red-800/50'}`}>
              <div>
                <p className="text-xs uppercase tracking-wider text-slate-400 font-semibold mb-1">2C Error</p>
                <p className={`text-2xl font-mono ${isCollimationPass ? 'text-emerald-400' : 'text-red-400'}`}>
                  {collimationResult.twoC.toFixed(1)}"
                </p>
              </div>
              <div className={`px-4 py-1.5 rounded-md font-bold text-sm tracking-wide ${isCollimationPass ? 'bg-emerald-800/80 text-emerald-100' : 'bg-red-800/80 text-red-100'}`}>
                {isCollimationPass ? 'PASS (<20")' : 'FAIL (≥20")'}
              </div>
            </div>
          )}
        </div>

        {/* EDM Baseline */}
        <div className="p-5 bg-slate-800 rounded-lg border border-slate-700 space-y-4 shadow-sm">
          <h3 className="text-lg font-semibold text-slate-200">EDM Baseline (ISO 17123-4)</h3>
          
          <div className="space-y-3">
            <div>
              <label className="block text-sm text-slate-400 mb-1">Certified Distances (m, comma-separated)</label>
              <input type="text" className="w-full bg-slate-950 border border-slate-700 rounded p-2.5 text-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500" value={certifiedLegs} onChange={e => setCertifiedLegs(e.target.value)} placeholder="10.000, 20.000, 50.000" />
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">Measured Distances (m, comma-separated)</label>
              <input type="text" className="w-full bg-slate-950 border border-slate-700 rounded p-2.5 text-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500" value={measuredLegs} onChange={e => setMeasuredLegs(e.target.value)} placeholder="10.002, 20.003, 50.001" />
            </div>
          </div>

          {edmResult && (
            <div className="mt-5 p-4 bg-slate-900 rounded-lg border border-slate-700 grid grid-cols-2 gap-4 shadow-inner">
              <div>
                <p className="text-xs uppercase tracking-wider text-slate-400 font-semibold mb-1">Mean Offset</p>
                <p className="text-xl font-mono text-blue-400">{edmResult.meanOffset.toFixed(2)} mm</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wider text-slate-400 font-semibold mb-1">Scale Factor</p>
                <p className="text-xl font-mono text-purple-400">{edmResult.scale.toFixed(1)} ppm</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Timeline / History */}
      <div className="pt-6">
        <h3 className="text-xl font-bold text-slate-200 mb-4 border-b border-slate-800 pb-2">History</h3>
        {records.length === 0 ? (
          <p className="text-slate-500 italic">No calibration records found.</p>
        ) : (
          <div className="space-y-3">
            {records.map(record => (
              <div key={record.id} className="flex justify-between items-center bg-slate-800 p-4 rounded-lg border border-slate-700">
                <div>
                  <div className="flex items-center space-x-3 mb-1">
                    <span className="font-semibold text-slate-200">{record.equipmentName}</span>
                    <span className="text-xs bg-slate-700 px-2 py-0.5 rounded text-slate-300 capitalize">{record.calibrationType.replace('_', ' ')}</span>
                  </div>
                  <p className="text-sm text-slate-400">Performed: {record.date} • Due: {record.nextDueDate}</p>
                  {record.notes && <p className="text-sm text-slate-500 mt-1">{record.notes}</p>}
                </div>
                <div>
                  {record.results.passed ? (
                    <span className="px-3 py-1 bg-emerald-900/30 text-emerald-400 border border-emerald-800/50 rounded-full text-sm font-medium">Passed</span>
                  ) : (
                    <span className="px-3 py-1 bg-red-900/30 text-red-400 border border-red-800/50 rounded-full text-sm font-medium">Failed</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

    </div>
  );
}
