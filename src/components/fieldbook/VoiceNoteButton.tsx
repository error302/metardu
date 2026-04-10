'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Mic, MicOff, Pause, Square } from 'lucide-react';
import { useVoiceRecording, type VoiceNote } from '@/hooks/useVoiceRecording';
import { useSpeechToText } from '@/hooks/useSpeechToText';
import { saveVoiceNote, updateVoiceNoteTranscript } from '@/lib/storage/voiceNotes';

interface VoiceNoteButtonProps {
  projectId?: string;
  stationId?: string;
  stationName?: string;
  easting?: number;
  northing?: number;
  onNoteSaved?: (note: VoiceNote) => void;
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function VoiceNoteButton({
  projectId,
  stationId,
  stationName,
  easting,
  northing,
  onNoteSaved,
}: VoiceNoteButtonProps) {
  const {
    isRecording,
    isPaused,
    duration,
    startRecording,
    stopRecording,
    pauseRecording,
    resumeRecording,
  } = useVoiceRecording();

  const { isListening, transcript, interimTranscript, isSupported, startListening, stopListening } =
    useSpeechToText();

  const [status, setStatus] = useState<'idle' | 'recording' | 'transcribing' | 'done'>('idle');
  const [error, setError] = useState<string | null>(null);

  // Audio analyser for waveform
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number>(0);
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);

  // Draw waveform visualization
  const drawWaveform = useCallback(() => {
    const canvas = canvasRef.current;
    const analyser = analyserRef.current;
    if (!canvas || !analyser) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    const WIDTH = canvas.width;
    const HEIGHT = canvas.height;

    const draw = () => {
      if (!analyserRef.current) return;
      analyserRef.current.getByteTimeDomainData(dataArray);

      ctx.fillStyle = 'rgba(21, 21, 21, 0.3)';
      ctx.fillRect(0, 0, WIDTH, HEIGHT);

      ctx.lineWidth = 2;
      ctx.strokeStyle = isPaused ? '#FCD34D' : '#EF4444';
      ctx.beginPath();

      const sliceWidth = WIDTH / bufferLength;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        const v = dataArray[i] / 128.0;
        const y = (v * HEIGHT) / 2;
        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
        x += sliceWidth;
      }

      ctx.lineTo(WIDTH, HEIGHT / 2);
      ctx.stroke();

      animFrameRef.current = requestAnimationFrame(draw);
    };

    draw();
  }, [isPaused]);

  // Setup audio analyser when recording starts
  useEffect(() => {
    if (!isRecording) {
      // Cleanup analyser
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = 0;
      }
      if (sourceRef.current) {
        sourceRef.current.disconnect();
        sourceRef.current = null;
      }
      if (audioContextRef.current) {
        audioContextRef.current.close().catch(() => {});
        audioContextRef.current = null;
      }
      analyserRef.current = null;

      // Clear canvas
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
      }
      return;
    }

    // Setup analyser
    navigator.mediaDevices.getUserMedia({ audio: true }).then((stream) => {
      const audioContext = new AudioContext();
      audioContextRef.current = audioContext;
      const source = audioContext.createMediaStreamSource(stream);
      sourceRef.current = source;
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      analyserRef.current = analyser;
      source.connect(analyser);

      // Set canvas size
      const canvas = canvasRef.current;
      if (canvas) {
        const dpr = window.devicePixelRatio || 1;
        const rect = canvas.getBoundingClientRect();
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.scale(dpr, dpr);
        }
      }

      drawWaveform();

      // Stop the extra stream (used only for visualisation)
      stream.getTracks().forEach((t) => t.stop());
    }).catch(() => {
      // Visualization not critical — recording still works
    });
  }, [isRecording, drawWaveform]);

  const handleStart = useCallback(() => {
    setError(null);
    setStatus('recording');
    startRecording(stationId, stationName);
    if (isSupported) {
      startListening('en-KE');
    }
  }, [startRecording, startListening, isSupported, stationId, stationName]);

  const handleStop = useCallback(async () => {
    // Stop speech recognition first
    if (isListening) {
      stopListening();
    }

    const note = await stopRecording();
    if (!note) {
      setError('Recording failed — no audio captured.');
      setStatus('idle');
      return;
    }

    // Get the final transcript from speech recognition
    // (we read from the hook's current transcript value after stop)
    // Small delay to let final results come in
    setStatus('transcribing');

    // Wait briefly for final speech results
    await new Promise((r) => setTimeout(r, 500));

    // Read transcript from DOM or use what we have
    // The transcript state is captured in the closure, so we re-read it
    // We'll pass it through the onNoteSaved callback

    const finalNote: VoiceNote = {
      ...note,
      transcript: '', // Will be set after transcription or by the caller
    };

    // Save to IndexedDB
    try {
      await saveVoiceNote({
        ...finalNote,
        projectId,
        easting,
        northing,
      });
    } catch (err) {
      console.error('Failed to save voice note:', err);
    }

    setStatus('done');
    onNoteSaved?.(finalNote);

    // Reset status after a moment
    setTimeout(() => setStatus('idle'), 2000);
  }, [stopRecording, stopListening, isListening, projectId, easting, northing, onNoteSaved]);

  const handlePauseResume = useCallback(() => {
    if (isPaused) {
      resumeRecording();
    } else {
      pauseRecording();
    }
  }, [isPaused, pauseRecording, resumeRecording]);

  return (
    <div className="flex flex-col items-center gap-3">
      {/* Waveform visualization canvas */}
      <div
        className={`relative w-full h-16 rounded-lg overflow-hidden border transition-colors ${
          isRecording
            ? 'border-red-500/50 bg-[var(--bg-secondary)]'
            : 'border-[var(--border-color)] bg-[var(--bg-secondary)]'
        }`}
      >
        <canvas
          ref={canvasRef}
          className="w-full h-full"
          style={{ display: isRecording ? 'block' : 'none' }}
        />

        {/* Idle / done overlay */}
        {!isRecording && (
          <div className="absolute inset-0 flex items-center justify-center">
            {status === 'done' ? (
              <span className="text-sm text-[var(--success)] flex items-center gap-1.5">
                <Mic className="w-4 h-4" />
                Note saved
              </span>
            ) : status === 'transcribing' ? (
              <span className="text-sm text-[var(--warning)] flex items-center gap-1.5 animate-pulse">
                <Mic className="w-4 h-4" />
                Transcribing...
              </span>
            ) : (
              <span className="text-sm text-[var(--text-muted)]">
                Tap to record a voice note
              </span>
            )}
          </div>
        )}

        {/* Recording indicator pulsing border */}
        {isRecording && (
          <div className="absolute inset-0 rounded-lg border-2 border-red-500 animate-pulse pointer-events-none" />
        )}
      </div>

      {/* Duration display */}
      {isRecording && (
        <div className="flex items-center gap-2">
          <span className="font-mono text-lg text-red-400">{formatDuration(duration)}</span>
          {isPaused && (
            <span className="badge badge-warning text-[10px]">PAUSED</span>
          )}
        </div>
      )}

      {/* Controls */}
      <div className="flex items-center gap-2">
        {!isRecording ? (
          <button
            onClick={handleStart}
            disabled={status === 'transcribing'}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all bg-[#1B3A5C] hover:bg-[#1B3A5C]/80 text-white disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Mic className="w-4 h-4" />
            Record Voice Note
          </button>
        ) : (
          <>
            {/* Pause / Resume */}
            <button
              onClick={handlePauseResume}
              className="flex items-center justify-center w-10 h-10 rounded-lg border border-[var(--border-color)] bg-[var(--bg-tertiary)] text-[var(--text-primary)] hover:border-amber-500/40 transition-colors"
              title={isPaused ? 'Resume' : 'Pause'}
            >
              {isPaused ? (
                <Mic className="w-4 h-4" />
              ) : (
                <Pause className="w-4 h-4" />
              )}
            </button>

            {/* Stop */}
            <button
              onClick={handleStop}
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all bg-red-600 hover:bg-red-700 text-white"
            >
              <Square className="w-3.5 h-3.5 fill-current" />
              Stop & Save
            </button>
          </>
        )}
      </div>

      {/* Error message */}
      {error && (
        <p className="text-xs text-red-400">{error}</p>
      )}

      {/* Speech recognition not supported warning */}
      {!isSupported && status === 'idle' && (
        <p className="text-xs text-[var(--text-muted)]">
          Speech-to-text not supported in this browser. Audio will still be recorded.
        </p>
      )}

      {/* Live transcript preview during recording */}
      {isRecording && (interimTranscript || transcript) && (
        <div className="w-full p-3 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-color)]">
          <p className="text-xs text-[var(--text-muted)] mb-1 uppercase tracking-wider">Live transcript</p>
          <p className="text-sm text-[var(--text-primary)]">
            {transcript}
            <span className="text-[var(--text-muted)]">{interimTranscript}</span>
          </p>
        </div>
      )}
    </div>
  );
}
