import { useCallback, useEffect, useRef, useState } from 'react';

export interface GazePoint { x: number; y: number }
export interface EyeTrackerOptions { enabled: boolean; onGaze: (point: GazePoint) => void }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type WebgazerInstance = any;

/** Wraps WebGazer.js: a webcam-based gaze estimator. Runs its own hidden video feed,
 * independent of the face-blendshape camera used for Yes/No. GPL-3.0 licensed upstream —
 * see licensing note where this is surfaced to the user. */
export function useEyeTracker({ enabled, onGaze }: EyeTrackerOptions) {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const onGazeRef = useRef(onGaze); onGazeRef.current = onGaze;
  const instanceRef = useRef<WebgazerInstance>(null);

  useEffect(() => {
    if (!enabled) { setReady(false); return; }
    let cancelled = false;
    setError(null);

    (async () => {
      try {
        const mod = await import('webgazer');
        const webgazer: WebgazerInstance = mod.default;
        if (cancelled) return;
        instanceRef.current = webgazer;
        webgazer.saveDataAcrossSessions(false);
        webgazer.showVideoPreview(false);
        webgazer.showPredictionPoints(false);
        webgazer.showFaceOverlay(false);
        webgazer.showFaceFeedbackBox(false);
        webgazer.applyKalmanFilter(true);
        let sawGaze = false;
        webgazer.setGazeListener((data: GazePoint | null) => { if (data) { sawGaze = true; onGazeRef.current(data); } });
        // WebGazer calls window.alert() with an "only over https / run on localhost" notice
        // whenever the page's hostname isn't literally "localhost" (e.g. 127.0.0.1) in Chrome.
        // That's a blocking native dialog on an otherwise all-facial flow, so suppress it here.
        const realAlert = window.alert;
        window.alert = () => {};
        try { await webgazer.begin(); } finally { window.alert = realAlert; }
        if (cancelled) return;
        setReady(true);
        // WebGazer can "succeed" at begin() yet never actually produce a gaze reading (e.g. its
        // face-tracking model files failed to load). Surface that distinctly after a few seconds.
        setTimeout(() => { if (!cancelled && !sawGaze) setError('No gaze reading yet — check that the camera has a clear view of your face.'); }, 4000);
      } catch (e) {
        if (!cancelled) { setReady(false); setError(e instanceof Error ? e.message : 'Eye tracker failed to start.'); }
      }
    })();

    return () => {
      cancelled = true;
      try { instanceRef.current?.end(); } catch { /* Already stopped or never started. */ }
      instanceRef.current = null;
      setReady(false);
    };
  }, [enabled]);

  /** Feeds one training sample: "the gaze right now should map to screen point (x, y)".
   * Call this repeatedly while the user fixates a known on-screen point to calibrate. */
  const recordPoint = useCallback((x: number, y: number) => {
    try { instanceRef.current?.recordScreenPosition(x, y, 'click'); } catch { /* Not ready yet. */ }
  }, []);

  return { ready, error, recordPoint };
}
