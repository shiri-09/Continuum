export const HUMAN_VOICES = [
  { id: 'af_heart', label: 'Warm — female' },
  { id: 'am_michael', label: 'Calm — male' },
  { id: 'bf_emma', label: 'British — female' },
  { id: 'bm_george', label: 'British — male' },
] as const;
export type HumanVoiceId = (typeof HUMAN_VOICES)[number]['id'];

import type { KokoroTTS } from 'kokoro-js';
let loading: Promise<KokoroTTS> | null = null;

function loadKokoro(): Promise<KokoroTTS> {
  loading ??= import('kokoro-js').then(({ KokoroTTS: Kokoro }) =>
    Kokoro.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX', { dtype: 'q8' }),
  ).catch(error => { loading = null; throw error; });
  return loading;
}

export interface SpeakHandle { cancel(): void }
export interface SpeakCallbacks { voice?: HumanVoiceId; onStart?: () => void; onEnd?: () => void; onError?: (error: unknown) => void }

/** Generates and plays natural local speech. Never leaves the app silent: callers should fall back to onError. */
export function speakHuman(text: string, { voice = 'af_heart', onStart, onEnd, onError }: SpeakCallbacks = {}): SpeakHandle {
  let cancelled = false;
  let audioEl: HTMLAudioElement | null = null;
  (async () => {
    try {
      const tts = await loadKokoro();
      if (cancelled) return;
      const audio = await tts.generate(text, { voice });
      if (cancelled) return;
      const blob = audio.toBlob();
      const url = URL.createObjectURL(blob);
      const element = new Audio(url);
      audioEl = element;
      element.onplay = () => { if (!cancelled) onStart?.(); };
      element.onended = () => { URL.revokeObjectURL(url); if (!cancelled) onEnd?.(); };
      element.onerror = () => { URL.revokeObjectURL(url); if (!cancelled) onError?.(new Error('Local voice playback failed.')); };
      if (cancelled) { URL.revokeObjectURL(url); return; }
      await element.play();
    } catch (error) {
      if (!cancelled) onError?.(error);
    }
  })();
  return { cancel: () => { cancelled = true; audioEl?.pause(); } };
}
