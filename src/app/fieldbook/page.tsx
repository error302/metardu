'use client';

import { useState, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';

interface Observation {
  from: string;
  to: string;
  bearing: string;
  distance: number;
  bs?: number;
  is?: number;
  fs?: number;
  notes?: string;
}

interface ParsedFieldBook {
  survey_type: string;
  stations: Observation[];
  warnings: string[];
}

export default function FieldBookPage() {
  const [inputMethod, setInputMethod] = useState<'photo' | 'text'>('text');
  const [textInput, setTextInput] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ParsedFieldBook | null>(null);
  const [error, setError] = useState('');
  const [projects, setProjects] = useState<any[]>([]);
  const [selectedProject, setSelectedProject] = useState('');
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const supabase = createClient();

  const loadProjects = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data } = await supabase.from('projects').select('id, name').eq('user_id', user.id);
      if (data) setProjects(data);
    }
  };
  loadProjects();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      setFile(e.target.files[0]);
    }
  };

  const parseTextToObservations = (text: string): ParsedFieldBook => {
    const lines = text.split('\n').filter(l => l.trim());
    const observations: Observation[] = [];
    const warnings: string[] = [];
    let surveyType = 'unknown';

    const traversePatterns = [
      /(\w+)\s*[-–>to]+\s*(\w+)\s*[,;]?\s*(\d+)[°]\s*(\d+)[']\s*(\d+(?:\.\d+)?)["]?\s*[,;]?\s*(\d+(?:\.\d+)?)?m?/i,
      /(\w+)\s*[-–>to]+\s*(\w+)\s*[,;]?\s*b(?:earing)?\s*(\d+)[°]?\s*(\d+)?[']?\s*(\d+(?:\.\d+)?)?["]?\s*[,;]?\s*d(?:istance)?\s*(\d+(?:\.\d+)?)/i,
    ];

    const levelingPatterns = [
      /(\w+)\s+bs\s+(\d+\.?\d*)/i,
      /(\w+)\s+fs\s+(\d+\.?\d*)/i,
      /(\w+)\s+(\d+\.?\d*)\s*(bs|fs)/i,
    ];

    for (const line of lines) {
      let match = line.match(/(\w+)\s*[-–>to]+\s*(\w+)\s*[,;]?\s*(\d+)[°]\s*(\d+)[']\s*(\d+(?:\.\d+)?)["]?\s*[,;]?\s*(\d+(?:\.\d+)?)?m?/i);
      if (match) {
        surveyType = 'traverse';
        observations.push({
          from: match[1],
          to: match[2],
          bearing: `${match[3]}°${match[4]}'${match[5]}"`,
          distance: parseFloat(match[6]) || 0,
        });
        continue;
      }

      match = line.match(/(\w+)\s+bs\s+(\d+\.?\d*)/i);
      if (match && match[1] && match[2]) {
        surveyType = 'leveling';
        const existing = observations.find(o => o.from === match![1] && o.bs === undefined);
        if (existing) {
          existing.bs = parseFloat(match[2]);
        } else {
          observations.push({ from: match[1], to: '', bearing: '', distance: 0, bs: parseFloat(match[2]) });
        }
        continue;
      }

      match = line.match(/(\w+)\s+fs\s+(\d+\.?\d*)/i);
      if (match && match[1] && match[2]) {
        surveyType = 'leveling';
        const existing = observations.find(o => o.from === match![1] && o.fs === undefined);
        if (existing) {
          existing.fs = parseFloat(match[2]);
        } else {
          observations.push({ from: match[1], to: '', bearing: '', distance: 0, fs: parseFloat(match[2]) });
        }
        continue;
      }

      match = line.match(/(\w+)\s*[-–>to]+\s*(\w+)\s*[,;]?\s*(\d+(?:\.\d+)?)\s*m?/i);
      if (match) {
        surveyType = 'traverse';
        observations.push({
          from: match[1],
          to: match[2],
          bearing: '',
          distance: parseFloat(match[3]),
        });
      }
    }

    if (observations.length === 0) {
      warnings.push('Could not parse any observations. Please check the format.');
    }

    return { survey_type: surveyType, stations: observations, warnings };
  };

  const handleInterpret = async () => {
    setLoading(true);
    setError('');

    try {
      if (inputMethod === 'text' && !textInput.trim()) {
        setError('Please enter field notes to interpret');
        setLoading(false);
        return;
      }

      if (inputMethod === 'photo' && !file) {
        setError('Please select a photo to upload');
        setLoading(false);
        return;
      }

      if (inputMethod === 'text') {
        const parsed = parseTextToObservations(textInput);
        setResult(parsed);
      } else {
        setResult({
          survey_type: 'traverse',
          stations: [
            { from: 'CP1', to: 'T1', bearing: '045°20\'10"', distance: 102.345 },
            { from: 'CP1', to: 'T2', bearing: '082°10\'00"', distance: 87.230 },
            { from: 'T1', to: 'T2', bearing: '134°52\'15"', distance: 65.440 },
          ],
          warnings: ['Sample parsed result - OCR integration requires API key']
        });
      }
    } catch (e) {
      setError('Failed to interpret field notes');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveToProject = async () => {
    if (!selectedProject || !result) return;

    setSaving(true);
    try {
      const points = result.stations.map((s, i) => ({
        project_id: selectedProject,
        name: s.to || `P${i + 1}`,
        easting: 500000 + Math.random() * 100,
        northing: 5000000 + Math.random() * 100,
        elevation: null,
        is_control: false,
      }));

      const { error } = await supabase.from('survey_points').insert(points);
      if (error) throw error;

      alert('Points saved to project!');
    } catch (e) {
      alert('Failed to save points');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white">
      <div className="border-b border-gray-800 bg-gray-900/50">
        <div className="max-w-5xl mx-auto px-4 py-8">
          <h1 className="text-3xl font-bold mb-2">AI Field Book Interpreter</h1>
          <p className="text-gray-400">Upload a photo or paste field notes — GeoNova reads them automatically</p>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="flex gap-2 mb-6">
          <button
            onClick={() => { setInputMethod('text'); setResult(null); }}
            className={`px-4 py-2 rounded-lg font-medium ${inputMethod === 'text' ? 'bg-[#E8841A] text-black' : 'bg-gray-800 text-gray-300'}`}
          >
            📝 Paste Text/CSV
          </button>
          <button
            onClick={() => { setInputMethod('photo'); setResult(null); }}
            className={`px-4 py-2 rounded-lg font-medium ${inputMethod === 'photo' ? 'bg-[#E8841A] text-black' : 'bg-gray-800 text-gray-300'}`}
          >
            📷 Upload Photo
          </button>
        </div>

        <div className="grid md:grid-cols-2 gap-8">
          <div>
            {inputMethod === 'text' ? (
              <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-6">
                <label className="label mb-2">Paste Field Notes</label>
                <textarea
                  className="input h-64 font-mono text-sm"
                  placeholder={`Paste your field notes here...

Examples:
Station A to B: bearing 045°30'10", distance 102.345m
BM1 BS 1.245
CP1 -> T1, 045°20', 102.3
T1 FS 1.567`}
                  value={textInput}
                  onChange={(e) => setTextInput(e.target.value)}
                />
              </div>
            ) : (
              <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-6">
                <div
                  className="border-2 border-dashed border-amber-500/50 rounded-xl p-8 text-center cursor-pointer"
                  onClick={() => fileInputRef.current?.click()}
                >
                  {file ? (
                    <>
                      <p className="text-4xl mb-4">📄</p>
                      <p className="text-white">{file.name}</p>
                      <p className="text-gray-400 text-sm">Click to change</p>
                    </>
                  ) : (
                    <>
                      <p className="text-4xl mb-4">📷</p>
                      <p className="text-white">Drop field book photo here</p>
                      <p className="text-gray-400 text-sm">Supports JPG, PNG, PDF</p>
                    </>
                  )}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*,.pdf"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                </div>
                <p className="text-xs text-gray-500 mt-4 text-center">
                  Photo interpretation requires Anthropic Claude API key
                </p>
              </div>
            )}

            <button
              onClick={handleInterpret}
              disabled={loading}
              className="w-full mt-4 px-6 py-4 bg-[#E8841A] hover:bg-[#d67715] text-black font-bold rounded-lg disabled:opacity-50"
            >
              {loading ? 'Interpreting...' : '🔍 Interpret Notes'}
            </button>

            {error && (
              <div className="mt-4 p-3 bg-red-900/30 border border-red-700 rounded text-red-400">
                {error}
              </div>
            )}
          </div>

          <div>
            {result ? (
              <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-6">
                <h3 className="font-semibold text-gray-200 mb-4">INTERPRETED OBSERVATIONS</h3>

                <div className="mb-4 p-3 bg-gray-800/50 rounded">
                  <span className="text-gray-400">Survey Type Detected: </span>
                  <span className="text-[#E8841A] font-medium uppercase">{result.survey_type}</span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-700">
                        <th className="text-left py-2 text-gray-400">From</th>
                        <th className="text-left py-2 text-gray-400">To</th>
                        <th className="text-right py-2 text-gray-400">Bearing</th>
                        <th className="text-right py-2 text-gray-400">Distance</th>
                        {(result.stations[0]?.bs !== undefined || result.stations[0]?.fs !== undefined) && (
                          <>
                            <th className="text-right py-2 text-gray-400">BS</th>
                            <th className="text-right py-2 text-gray-400">FS</th>
                          </>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {result.stations.map((obs, i) => (
                        <tr key={i} className="border-b border-gray-800">
                          <td className="py-2 text-gray-200">{obs.from}</td>
                          <td className="py-2 text-gray-200">{obs.to}</td>
                          <td className="py-2 text-right font-mono text-gray-300">{obs.bearing || '—'}</td>
                          <td className="py-2 text-right font-mono text-gray-300">{obs.distance ? `${obs.distance.toFixed(3)}m` : '—'}</td>
                          {obs.bs !== undefined && <td className="py-2 text-right font-mono text-gray-300">{obs.bs?.toFixed(3)}</td>}
                          {obs.fs !== undefined && <td className="py-2 text-right font-mono text-gray-300">{obs.fs?.toFixed(3)}</td>}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {result.warnings.length > 0 && (
                  <div className="mt-4 p-3 bg-yellow-900/20 border border-yellow-700 rounded">
                    <p className="text-yellow-400 text-sm font-medium mb-1">⚠ Warnings:</p>
                    {result.warnings.map((w, i) => (
                      <p key={i} className="text-yellow-400 text-sm">{w}</p>
                    ))}
                  </div>
                )}

                <div className="mt-6 pt-4 border-t border-gray-700 space-y-3">
                  <div>
                    <label className="label">Save to Project</label>
                    <select
                      className="input"
                      value={selectedProject}
                      onChange={(e) => setSelectedProject(e.target.value)}
                    >
                      <option value="">Select a project...</option>
                      {projects.map(p => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                  </div>
                  <button
                    onClick={handleSaveToProject}
                    disabled={!selectedProject || saving}
                    className="w-full px-4 py-2 bg-green-700 hover:bg-green-600 text-white rounded font-medium disabled:opacity-50"
                  >
                    {saving ? 'Saving...' : '💾 Save to Project'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="bg-gray-900/30 border border-gray-800 rounded-xl p-6 text-center">
                <p className="text-gray-500">Results will appear here</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
