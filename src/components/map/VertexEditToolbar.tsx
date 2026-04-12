'use client';

import { useState } from 'react';
import {
  Pencil,
  Magnet,
  Plus,
  Trash2,
  MousePointer,
  ChevronDown,
  ChevronUp,
  X,
} from 'lucide-react';
import type { VertexEditingState } from '@/hooks/useVertexEditing';

interface VertexEditToolbarProps {
  /** Whether vertex editing is currently active */
  enabled: boolean;
  /** Toggle editing on/off */
  onToggle: () => void;
  /** Whether snap-to-vertex is active */
  snapEnabled: boolean;
  /** Toggle snap on/off */
  onSnapToggle: () => void;
  /** Current snap tolerance in pixels */
  snapTolerance: number;
  /** Change snap tolerance */
  onToleranceChange: (val: number) => void;
  /** Vertex editing state from the hook */
  editState: VertexEditingState;
}

export function VertexEditToolbar({
  enabled,
  onToggle,
  snapEnabled,
  onSnapToggle,
  snapTolerance,
  onToleranceChange,
  editState,
}: VertexEditToolbarProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className="bg-white rounded-lg shadow-lg border border-gray-200 select-none"
      style={{ fontFamily: 'Calibri, sans-serif', minWidth: 240 }}
    >
      {/* ── Header row ─────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <Pencil className="w-4 h-4 text-[#1B3A5C]" />
          <span className="text-sm font-semibold text-[#1B3A5C]">
            Vertex Editing
          </span>
        </div>
        <button
          onClick={onToggle}
          className={[
            'px-3 py-1 text-xs font-semibold rounded transition-colors',
            enabled
              ? 'bg-[#1B3A5C] text-white hover:bg-[#142d49]'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200',
          ].join(' ')}
        >
          {enabled ? 'On' : 'Off'}
        </button>
      </div>

      {/* ── Expanded controls (only when editing is active) ────── */}
      {enabled && (
        <>
          {/* Instructions & vertex count */}
          <div className="px-3 py-2 bg-blue-50 text-xs text-[#1B3A5C] leading-relaxed">
            <div className="flex items-center justify-between mb-1">
              <span className="font-semibold">Vertices: {editState.vertexCount}</span>
              <button
                onClick={() => setExpanded(v => !v)}
                className="p-0.5 hover:bg-blue-100 rounded"
                title={expanded ? 'Collapse' : 'Expand'}
              >
                {expanded ? (
                  <ChevronUp className="w-3.5 h-3.5" />
                ) : (
                  <ChevronDown className="w-3.5 h-3.5" />
                )}
              </button>
            </div>
            <div className="space-y-0.5 text-[11px] text-gray-600">
              <div className="flex items-center gap-1.5">
                <MousePointer className="w-3 h-3 shrink-0" />
                <span>Drag vertex to reposition</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Plus className="w-3 h-3 shrink-0" />
                <span>Double-click edge to insert vertex</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Trash2 className="w-3 h-3 shrink-0" />
                <span>Right-click vertex to remove (min 3)</span>
              </div>
            </div>
          </div>

          {/* Expanded: Snap controls & coordinates */}
          {expanded && (
            <div className="px-3 py-2 border-t border-gray-100 space-y-3">
              {/* Snap toggle */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Magnet className="w-3.5 h-3.5 text-[#1B3A5C]" />
                  <span className="text-xs text-gray-700">Snap to vertices</span>
                </div>
                <button
                  onClick={onSnapToggle}
                  className={[
                    'relative w-9 h-5 rounded-full transition-colors',
                    snapEnabled ? 'bg-[#1B3A5C]' : 'bg-gray-300',
                  ].join(' ')}
                >
                  <span
                    className={[
                      'absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform',
                      snapEnabled ? 'translate-x-4' : 'translate-x-0.5',
                    ].join(' ')}
                  />
                </button>
              </div>

              {/* Tolerance slider */}
              {snapEnabled && (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[11px] text-gray-500">
                      Snap tolerance
                    </span>
                    <span className="text-[11px] font-mono text-[#1B3A5C]">
                      {snapTolerance}px
                    </span>
                  </div>
                  <input
                    type="range"
                    min={5}
                    max={20}
                    step={1}
                    value={snapTolerance}
                    onChange={(e) => onToleranceChange(Number(e.target.value))}
                    className="w-full h-1.5 accent-[#1B3A5C] cursor-pointer"
                  />
                  <div className="flex justify-between text-[10px] text-gray-400 mt-0.5">
                    <span>5px</span>
                    <span>20px</span>
                  </div>
                </div>
              )}

              {/* Hovered / last edited vertex coordinates */}
              {(editState.hoveredVertex || editState.lastEditedVertex) && (
                <div className="border-t border-gray-100 pt-2">
                  <div className="text-[10px] text-gray-500 uppercase mb-1">
                    {editState.hoveredVertex ? 'Hovered' : 'Last Edited'}
                  </div>
                  {editState.hoveredVertex && (
                    <div className="text-xs font-mono text-[#1B3A5C]">
                      <span className="text-gray-500 mr-1">
                        V{editState.hoveredVertex.index + 1}
                      </span>
                      <span className="text-gray-400 mr-0.5">E</span>
                      {editState.hoveredVertex.easting.toFixed(3)}
                      <span className="text-gray-300 mx-1">|</span>
                      <span className="text-gray-400 mr-0.5">N</span>
                      {editState.hoveredVertex.northing.toFixed(3)}
                    </div>
                  )}
                  {!editState.hoveredVertex && editState.lastEditedVertex && (
                    <div className="text-xs font-mono text-[#1B3A5C]">
                      <span className="text-gray-500 mr-1">
                        V{editState.lastEditedVertex.index + 1}
                      </span>
                      <span className="text-gray-400 mr-0.5">E</span>
                      {editState.lastEditedVertex.easting.toFixed(3)}
                      <span className="text-gray-300 mx-1">|</span>
                      <span className="text-gray-400 mr-0.5">N</span>
                      {editState.lastEditedVertex.northing.toFixed(3)}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Dismiss button */}
          <div className="px-3 py-1.5 border-t border-gray-100">
            <button
              onClick={() => {
                onToggle();
                setExpanded(false);
              }}
              className="w-full py-1 text-xs text-gray-500 hover:text-red-600 hover:bg-red-50 rounded flex items-center justify-center gap-1 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
              Stop Editing
            </button>
          </div>
        </>
      )}
    </div>
  );
}
