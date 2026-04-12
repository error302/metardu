'use client';

import { useState } from 'react';
import { X, Mic, Camera, Check } from 'lucide-react';

interface QuickAddModalProps {
  onAdd: (obs: {
    station_from: string;
    station_to: string;
    horizontal_angle: number;
    vertical_angle: number;
    slope_distance: number;
    target_height: number;
    instrument_height: number;
    remarks: string;
  }) => void;
  onClose: () => void;
}

export function QuickAddModal({ onAdd, onClose }: QuickAddModalProps) {
  const [form, setForm] = useState({
    station_from: '',
    station_to: '',
    horizontal_angle: '',
    vertical_angle: '90',
    slope_distance: '',
    target_height: '1.500',
    instrument_height: '1.500',
    remarks: '',
  });

  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    if (!form.station_from || !form.station_to || !form.slope_distance) return;
    
    setSaving(true);
    
    try {
      await onAdd({
        station_from: form.station_from.toUpperCase(),
        station_to: form.station_to.toUpperCase(),
        horizontal_angle: parseFloat(form.horizontal_angle) || 0,
        vertical_angle: parseFloat(form.vertical_angle) || 90,
        slope_distance: parseFloat(form.slope_distance) || 0,
        target_height: parseFloat(form.target_height) || 1.5,
        instrument_height: parseFloat(form.instrument_height) || 1.5,
        remarks: form.remarks,
      });
    } finally {
      setSaving(false);
    }
  };

  const inputClass = "w-full p-4 text-xl border rounded-lg touch-manipulation";
  const labelClass = "block text-sm font-medium mb-1";

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end">
      <div className="w-full bg-white rounded-t-2xl max-h-[95vh] overflow-auto flex flex-col">
        <div className="sticky top-0 bg-white border-b px-4 py-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">New Observation</h2>
          <button 
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-gray-100"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="flex-1 overflow-auto p-4 space-y-4">
          <div>
            <label className={labelClass}>From Station</label>
            <input
              type="text"
              value={form.station_from}
              onChange={(e) => setForm({ ...form, station_from: e.target.value.toUpperCase() })}
              className={inputClass}
              placeholder="A"
              autoFocus
              autoComplete="off"
            />
          </div>

          <div>
            <label className={labelClass}>To Station</label>
            <input
              type="text"
              value={form.station_to}
              onChange={(e) => setForm({ ...form, station_to: e.target.value.toUpperCase() })}
              className={inputClass}
              placeholder="1"
              autoComplete="off"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Horiz. Angle (°)</label>
              <input
                type="number"
                step="0.0001"
                value={form.horizontal_angle}
                onChange={(e) => setForm({ ...form, horizontal_angle: e.target.value })}
                className={inputClass}
                placeholder="45.1234"
              />
            </div>
            <div>
              <label className={labelClass}>Vert. Angle (°)</label>
              <input
                type="number"
                step="0.0001"
                value={form.vertical_angle}
                onChange={(e) => setForm({ ...form, vertical_angle: e.target.value })}
                className={inputClass}
                placeholder="90.0000"
              />
            </div>
          </div>

          <div>
            <label className={labelClass}>Slope Distance (m)</label>
            <input
              type="number"
              step="0.001"
              value={form.slope_distance}
              onChange={(e) => setForm({ ...form, slope_distance: e.target.value })}
              className={inputClass}
              placeholder="125.456"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>HI (m)</label>
              <input
                type="number"
                step="0.001"
                value={form.instrument_height}
                onChange={(e) => setForm({ ...form, instrument_height: e.target.value })}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>HT (m)</label>
              <input
                type="number"
                step="0.001"
                value={form.target_height}
                onChange={(e) => setForm({ ...form, target_height: e.target.value })}
                className={inputClass}
              />
            </div>
          </div>

          <div>
            <label className={labelClass}>Remarks</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={form.remarks}
                onChange={(e) => setForm({ ...form, remarks: e.target.value })}
                className={`${inputClass} flex-1`}
                placeholder="Concrete beacon, flush"
              />
              <button 
                className="p-4 border rounded-lg bg-gray-50 hover:bg-gray-100"
                title="Voice input (Phase 28)"
              >
                <Mic className="w-6 h-6 text-gray-400" />
              </button>
            </div>
          </div>

          <button className="w-full p-4 border rounded-lg flex items-center justify-center gap-2 hover:bg-gray-50">
            <Camera className="w-5 h-5" />
            <span>Attach Beacon Photo</span>
          </button>
        </div>

        <div className="sticky bottom-0 p-4 bg-white border-t">
          <button
            onClick={handleSubmit}
            disabled={!form.station_from || !form.station_to || !form.slope_distance || saving}
            className={[
              'w-full py-4 rounded-lg font-semibold text-lg transition-colors',
              form.station_from && form.station_to && form.slope_distance && !saving
                ? 'bg-blue-600 text-white active:bg-blue-700'
                : 'bg-gray-200 text-gray-400 cursor-not-allowed',
            ].join(' ')}
          >
            {saving ? (
              'Saving...'
            ) : (
              <span className="flex items-center justify-center gap-2">
                <Check className="w-5 h-5" />
                Save Observation
              </span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}