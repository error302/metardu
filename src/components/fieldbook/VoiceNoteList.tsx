'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Play,
  Pause,
  Trash2,
  ChevronDown,
  ChevronUp,
  Mic,
  MapPin,
  Clock,
} from 'lucide-react';
import {
  type VoiceNoteRecord,
  getAllVoiceNotes,
  getVoiceNotesByProject,
  getVoiceNotesByStation,
  deleteVoiceNote as deleteNoteFromDB,
} from '@/lib/storage/voiceNotes';

interface VoiceNoteListProps {
  projectId?: string;
  stationId?: string;
  onRefresh?: () => void;
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function formatTimestamp(ts: number): string {
  const date = new Date(ts);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (isToday) return `Today ${timeStr}`;
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ` ${timeStr}`;
}

interface VoiceNoteItemProps {
  note: VoiceNoteRecord;
  onDelete: (id: string) => void;
}

function VoiceNoteItem({ note, onDelete }: VoiceNoteItemProps) {
  const [expanded, setExpanded] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Create audio URL on mount
  useEffect(() => {
    const url = URL.createObjectURL(note.audioBlob);
    setAudioUrl(url);
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [note.audioBlob]);

  // Handle audio events
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleTimeUpdate = () => setCurrentTime(audio.currentTime);
    const handleEnded = () => setIsPlaying(false);
    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('play', handlePlay);
    audio.addEventListener('pause', handlePause);

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('pause', handlePause);
    };
  }, [audioUrl]);

  const togglePlayback = useCallback(() => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play().catch(() => {
        console.error('Playback failed');
      });
    }
  }, [isPlaying]);

  const handleSeek = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!audioRef.current || !note.duration) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const fraction = (e.clientX - rect.left) / rect.width;
      audioRef.current.currentTime = fraction * note.duration;
    },
    [note.duration]
  );

  const progress = note.duration > 0 ? (currentTime / note.duration) * 100 : 0;

  const transcriptPreview = note.transcript
    ? note.transcript.length > 80
      ? note.transcript.slice(0, 80) + '...'
      : note.transcript
    : 'No transcript available';

  return (
    <div className="bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-lg overflow-hidden transition-colors hover:border-[var(--border-hover)]">
      {/* Hidden audio element */}
      {audioUrl && <audio ref={audioRef} src={audioUrl} preload="metadata" />}

      {/* Header row */}
      <div className="flex items-center gap-3 px-4 py-3">
        {/* Play button */}
        <button
          onClick={togglePlayback}
          className="flex-shrink-0 flex items-center justify-center w-9 h-9 rounded-full bg-[#1B3A5C] hover:bg-[#1B3A5C]/80 text-white transition-colors"
          title={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? (
            <Pause className="w-4 h-4 fill-current" />
          ) : (
            <Play className="w-4 h-4 fill-current ml-0.5" />
          )}
        </button>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            {note.stationName ? (
              <span className="flex items-center gap-1 text-sm font-medium text-[var(--text-primary)]">
                <MapPin className="w-3 h-3 text-[#1B3A5C]" />
                {note.stationName}
              </span>
            ) : (
              <span className="flex items-center gap-1 text-sm font-medium text-[var(--text-primary)]">
                <Mic className="w-3 h-3 text-[#1B3A5C]" />
                Voice Note
              </span>
            )}
            <span className="text-xs text-[var(--text-muted)]">
              {formatDuration(note.duration)}
            </span>
          </div>

          {/* Progress bar */}
          <div
            className="h-1 bg-[var(--bg-tertiary)] rounded-full cursor-pointer mb-1"
            onClick={handleSeek}
          >
            <div
              className="h-full bg-[#1B3A5C] rounded-full transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-[var(--text-muted)] flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {formatTimestamp(note.timestamp)}
            </span>
            {!expanded && note.transcript && (
              <span className="text-xs text-[var(--text-secondary)] truncate">
                {transcriptPreview}
              </span>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 flex-shrink-0">
          {note.transcript && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="p-1.5 rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] transition-colors"
              title={expanded ? 'Collapse' : 'Expand transcript'}
            >
              {expanded ? (
                <ChevronUp className="w-4 h-4" />
              ) : (
                <ChevronDown className="w-4 h-4" />
              )}
            </button>
          )}
          <button
            onClick={() => {
              if (confirm('Delete this voice note?')) {
                onDelete(note.id);
              }
            }}
            className="p-1.5 rounded text-[var(--text-muted)] hover:text-red-400 hover:bg-red-400/10 transition-colors"
            title="Delete voice note"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Expanded transcript */}
      {expanded && (
        <div className="px-4 pb-3 border-t border-[var(--border-color)]">
          <p className="label mt-2 mb-1">Transcript</p>
          <p className="text-sm text-[var(--text-primary)] leading-relaxed whitespace-pre-wrap">
            {note.transcript || 'No transcript available. Speech recognition may not have been available during recording.'}
          </p>
        </div>
      )}

      {/* Coordinates info */}
      {note.easting !== undefined && note.northing !== undefined && (
        <div className="px-4 pb-2 border-t border-[var(--border-color)] pt-2">
          <span className="text-xs font-mono text-[var(--text-muted)]">
            E: {note.easting.toFixed(3)} &nbsp; N: {note.northing.toFixed(3)}
          </span>
        </div>
      )}
    </div>
  );
}

export function VoiceNoteList({ projectId, stationId, onRefresh }: VoiceNoteListProps) {
  const [notes, setNotes] = useState<VoiceNoteRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const loadNotes = useCallback(async () => {
    setLoading(true);
    try {
      let result: VoiceNoteRecord[];
      if (stationId) {
        result = await getVoiceNotesByStation(stationId);
      } else if (projectId) {
        result = await getVoiceNotesByProject(projectId);
      } else {
        result = await getAllVoiceNotes();
      }
      setNotes(result);
    } catch (err) {
      console.error('Failed to load voice notes:', err);
    } finally {
      setLoading(false);
    }
  }, [projectId, stationId]);

  useEffect(() => {
    loadNotes();
  }, [loadNotes]);

  const handleDelete = useCallback(
    async (id: string) => {
      try {
        await deleteNoteFromDB(id);
        setNotes((prev) => prev.filter((n) => n.id !== id));
        onRefresh?.();
      } catch (err) {
        console.error('Failed to delete voice note:', err);
      }
    },
    [onRefresh]
  );

  if (loading) {
    return (
      <div className="card p-4">
        <p className="label mb-3">Voice Notes</p>
        <div className="flex items-center justify-center py-8">
          <div className="w-5 h-5 border-2 border-[var(--border-color)] border-t-[#1B3A5C] rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="card-header flex items-center justify-between">
        <span className="label mb-0">
          Voice Notes {notes.length > 0 && `(${notes.length})`}
        </span>
        <button
          onClick={loadNotes}
          className="text-xs text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors"
        >
          Refresh
        </button>
      </div>

      <div className="p-4">
        {notes.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <Mic className="w-8 h-8 text-[var(--text-muted)] mb-2" />
            <p className="text-sm text-[var(--text-muted)]">No voice notes yet</p>
            <p className="text-xs text-[var(--text-muted)] mt-1">
              Record voice notes to attach descriptions to survey points
            </p>
          </div>
        ) : (
          <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
            {notes.map((note) => (
              <VoiceNoteItem key={note.id} note={note} onDelete={handleDelete} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
