'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export type RecorderState = 'idle' | 'listening' | 'processing' | 'error';

const BAND_COUNT = 7;

/**
 * Peak input level below which a recording is treated as silence.
 *
 * Whisper hallucinates on silent audio — it confidently returns filler like
 * "Thank you." — so an empty recording must never reach the API. Deliberately
 * low: wrongly rejecting quiet speech is a worse failure than occasionally
 * letting silence through to the server-side backstop.
 */
const SPEECH_PEAK_THRESHOLD = 0.015;

/**
 * Microphone capture with a live amplitude read-out.
 *
 * MediaRecorder produces the blob the transcription endpoint needs, while a
 * parallel AnalyserNode drives the waveform in the UI — without it the mic
 * sheet has no way to show that it is actually hearing something.
 */
export function useRecorder({
  onComplete,
}: {
  onComplete: (blob: Blob) => void | Promise<void>;
}) {
  const [state, setState] = useState<RecorderState>('idle');
  const [error, setError] = useState('');
  const [levels, setLevels] = useState<number[]>(() => new Array(BAND_COUNT).fill(0.2));
  const [elapsed, setElapsed] = useState(0);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Loudest frame observed, unclamped, used to tell speech from an open mic.
  const peakRef = useRef(0);
  // `onComplete` is usually an inline closure; keeping it in a ref means the
  // recorder never restarts just because the parent re-rendered.
  const completeRef = useRef(onComplete);
  useEffect(() => {
    completeRef.current = onComplete;
  }, [onComplete]);

  const teardown = useCallback(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
    setLevels(new Array(BAND_COUNT).fill(0.2));
  }, []);

  useEffect(() => teardown, [teardown]);

  const start = useCallback(async () => {
    if (state === 'listening' || state === 'processing') return;
    setError('');
    setElapsed(0);
    peakRef.current = 0;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      streamRef.current = stream;

      // Waveform tap.
      try {
        const AudioCtx =
          window.AudioContext ??
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        const ctx = new AudioCtx();
        audioCtxRef.current = ctx;
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        ctx.createMediaStreamSource(stream).connect(analyser);
        const bins = new Uint8Array(analyser.frequencyBinCount);
        const perBand = Math.floor(bins.length / BAND_COUNT);

        const tick = () => {
          analyser.getByteFrequencyData(bins);
          const next: number[] = [];
          let frameTotal = 0;
          for (let b = 0; b < BAND_COUNT; b++) {
            let sum = 0;
            for (let i = 0; i < perBand; i++) sum += bins[b * perBand + i];
            const avg = sum / perBand / 255;
            frameTotal += avg;
            // The display floor keeps the waveform alive; the peak below is
            // measured before clamping so silence stays distinguishable.
            next.push(Math.min(1, Math.max(0.18, avg * 2.4)));
          }
          peakRef.current = Math.max(peakRef.current, frameTotal / BAND_COUNT);
          setLevels(next);
          rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);
      } catch {
        // A missing AudioContext costs us the waveform, not the recording.
      }

      const mimeType = MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : MediaRecorder.isTypeSupported('audio/mp4')
        ? 'audio/mp4'
        : '';
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, {
          type: recorder.mimeType || 'audio/webm',
        });
        teardown();

        // Anything this small is a mis-tap, not speech.
        if (blob.size < 1200) {
          setState('idle');
          return;
        }

        // An open mic that never heard anything: stop before Whisper gets a
        // chance to invent words for the silence.
        if (peakRef.current < SPEECH_PEAK_THRESHOLD) {
          setState('error');
          setError("I didn't catch anything — check your mic and try again.");
          return;
        }

        setState('processing');
        try {
          await completeRef.current(blob);
          setState('idle');
        } catch (err) {
          setState('error');
          setError(err instanceof Error ? err.message : 'Transcription failed');
        }
      };

      recorder.start(250);
      setState('listening');
      timerRef.current = setInterval(() => setElapsed((s) => s + 1), 1000);
    } catch {
      teardown();
      setState('error');
      setError('Microphone unavailable — check browser permissions.');
    }
  }, [state, teardown]);

  const stop = useCallback(() => {
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop();
    }
  }, []);

  const cancel = useCallback(() => {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      // Drop the audio before stopping so `onstop` has nothing to send.
      chunksRef.current = [];
      recorder.stop();
    }
    teardown();
    setState('idle');
  }, [teardown]);

  const reset = useCallback(() => {
    setState('idle');
    setError('');
  }, []);

  return { state, error, levels, elapsed, start, stop, cancel, reset };
}

export function formatElapsed(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}
