'use client';

import { useState, useRef, useCallback, useEffect } from 'react';

export interface VoiceNote {
  id: string;
  stationId?: string;
  stationName?: string;
  easting?: number;
  northing?: number;
  audioBlob: Blob;
  transcript: string;
  duration: number;
  timestamp: number;
}

export interface UseVoiceRecordingReturn {
  isRecording: boolean;
  isPaused: boolean;
  duration: number;
  audioUrl: string | null;
  startRecording: (stationId?: string, stationName?: string) => void;
  stopRecording: () => Promise<VoiceNote | null>;
  pauseRecording: () => void;
  resumeRecording: () => void;
}

export function useVoiceRecording(): UseVoiceRecordingReturn {
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [duration, setDuration] = useState(0);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0);
  const elapsedRef = useRef<number>(0);
  const stationIdRef = useRef<string | undefined>(undefined);
  const stationNameRef = useRef<string | undefined>(undefined);

  const startTimer = useCallback(() => {
    startTimeRef.current = Date.now();
    timerRef.current = setInterval(() => {
      const elapsed = elapsedRef.current + (Date.now() - startTimeRef.current) / 1000;
      setDuration(Math.floor(elapsed));
    }, 200);
  }, []);

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    elapsedRef.current += (Date.now() - startTimeRef.current) / 1000;
    setDuration(Math.floor(elapsedRef.current));
  }, []);

  const startRecording = useCallback((stationId?: string, stationName?: string) => {
    stationIdRef.current = stationId;
    stationNameRef.current = stationName;
    chunksRef.current = [];
    elapsedRef.current = 0;
    setDuration(0);
    setIsPaused(false);

    // Clean up any previous audio URL
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
      setAudioUrl(null);
    }

    navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then((stream) => {
        // Check for supported MIME type
        const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
          ? 'audio/webm;codecs=opus'
          : MediaRecorder.isTypeSupported('audio/webm')
            ? 'audio/webm'
            : 'audio/mp4';

        const mediaRecorder = new MediaRecorder(stream, { mimeType });
        mediaRecorderRef.current = mediaRecorder;

        mediaRecorder.ondataavailable = (event) => {
          if (event.data && event.data.size > 0) {
            chunksRef.current.push(event.data);
          }
        };

        mediaRecorder.onstop = () => {
          // Stop all tracks to release microphone
          stream.getTracks().forEach((track) => track.stop());

          const blob = new Blob(chunksRef.current, { type: mimeType });
          const url = URL.createObjectURL(blob);
          setAudioUrl(url);
        };

        mediaRecorder.start(250); // collect data every 250ms
        setIsRecording(true);
        startTimer();
      })
      .catch((err) => {
        console.error('Failed to start recording:', err);
      });
  }, [audioUrl, startTimer]);

  const stopRecording = useCallback(async (): Promise<VoiceNote | null> => {
    if (!mediaRecorderRef.current || mediaRecorderRef.current.state === 'inactive') {
      return null;
    }

    return new Promise<VoiceNote | null>((resolve) => {
      const recorder = mediaRecorderRef.current!;

      recorder.onstop = () => {
        const stream = recorder.stream;
        if (stream) {
          stream.getTracks().forEach((track) => track.stop());
        }

        stopTimer();

        const mimeType = recorder.mimeType || 'audio/webm';
        const blob = new Blob(chunksRef.current, { type: mimeType });
        const url = URL.createObjectURL(blob);
        setAudioUrl(url);

        const note: VoiceNote = {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
          stationId: stationIdRef.current,
          stationName: stationNameRef.current,
          audioBlob: blob,
          transcript: '',
          duration: elapsedRef.current,
          timestamp: Date.now(),
        };

        setIsRecording(false);
        setIsPaused(false);
        mediaRecorderRef.current = null;
        resolve(note);
      };

      if (recorder.state === 'paused') {
        recorder.resume();
      }
      recorder.stop();
    });
  }, [stopTimer]);

  const pauseRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.pause();
      setIsPaused(true);
      stopTimer();
    }
  }, [stopTimer]);

  const resumeRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'paused') {
      mediaRecorderRef.current.resume();
      setIsPaused(false);
      startTimer();
    }
  }, [startTimer]);

  // Clean up on unmount: stop recorder, clear interval, release mic
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      const recorder = mediaRecorderRef.current;
      if (recorder && recorder.state !== 'inactive') {
        const stream = recorder.stream;
        if (stream) {
          stream.getTracks().forEach((track) => track.stop());
        }
        try {
          recorder.stop();
        } catch {
          // ignore if already stopped
        }
      }
      mediaRecorderRef.current = null;
    };
  }, []);

  return {
    isRecording,
    isPaused,
    duration,
    audioUrl,
    startRecording,
    stopRecording,
    pauseRecording,
    resumeRecording,
  };
}
