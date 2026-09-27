import { useCallback, useEffect, useRef, useState } from 'react';
import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import { fitCalibration, fitLenient, quantile, quickProfile, GestureDetector, type GestureEvent, type QuickProfile } from './gestureDetector';
import { startupDeadline } from './startupDeadline';

export type CameraGesture = 'mouth' | 'eyebrows';
export const PROFILE_CANDIDATES: { gesture: CameraGesture; label: string; instruction: string }[] = [
  { gesture: 'eyebrows', label: 'Raise your eyebrows', instruction: 'Raise your eyebrows comfortably, then relax.' },
  { gesture: 'mouth', label: 'Open your mouth', instruction: 'Open your mouth comfortably, then close it.' },
];
const findScore = (features: { categoryName: string; score: number }[] | undefined, name: string) => features?.find(c => c.categoryName === name)?.score;
const scoreFor = (gesture: CameraGesture, features?: { categoryName: string; score: number }[]): number | undefined =>
  gesture === 'mouth' ? findScore(features, 'jawOpen') : findScore(features, 'browInnerUp');
export type CalibrationStage = 'idle' | 'rest-ready' | 'rest-recording' | 'active-ready' | 'active-recording' | 'nuisance-ready' | 'nuisance-recording' | 'practice' | 'complete' | 'failed';
export type ProfileStage = 'idle' | 'rest' | 'active' | 'done';
export type ExtraStage = 'idle' | 'rest' | 'active' | 'done';
export interface ProfileResult { gesture: CameraGesture; label: string; separation: number; quality: QuickProfile['quality'] }
export interface SavedCalibration { gesture: CameraGesture; activationThreshold: number; releaseThreshold: number; calibratedAt: number }
const CALIBRATION_KEY = 'continuum.calibration';
export const readSavedCalibration = (): SavedCalibration | null => {
  try {
    const raw = localStorage.getItem(CALIBRATION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SavedCalibration>;
    if (typeof parsed.gesture !== 'string' || typeof parsed.activationThreshold !== 'number' || typeof parsed.releaseThreshold !== 'number') return null;
    return parsed as SavedCalibration;
  } catch { return null; }
};
export const clearSavedCalibration = () => { try { localStorage.removeItem(CALIBRATION_KEY); } catch { /* Storage may be unavailable. */ } };

export type ExtraKey = 'yes' | 'no';
export const EXTRA_CANDIDATES: { key: ExtraKey; label: string; instruction: string }[] = [
  { key: 'yes', label: 'Yes (eyebrow raise)', instruction: 'Raise your eyebrows comfortably, then relax.' },
  { key: 'no', label: 'No (open mouth)', instruction: 'Open your mouth like a whistle, then close it.' },
];
const scoreForExtra: Record<ExtraKey, (features?: { categoryName: string; score: number }[]) => number | undefined> = {
  yes: f => findScore(f, 'browInnerUp'),
  no: f => findScore(f, 'jawOpen'),
};
type ExtraFit = { activationThreshold: number; releaseThreshold: number };
const EXTRA_KEY_STORAGE = 'continuum.extraCalibration';
const readExtraCalibration = (): Partial<Record<ExtraKey, ExtraFit>> => {
  try {
    const raw = localStorage.getItem(EXTRA_KEY_STORAGE);
    return raw ? JSON.parse(raw) as Partial<Record<ExtraKey, ExtraFit>> : {};
  } catch { return {}; }
};
const DEFAULT_EXTRA_FIT: Record<ExtraKey, ExtraFit> = {
  yes: { activationThreshold: 0.35, releaseThreshold: 0.12 },
  no: { activationThreshold: 0.35, releaseThreshold: 0.12 },
};
export interface CameraInputOptions {
  enabled: boolean;
  onActivate: () => void;
  onUnavailable: (reason: string) => void;
  onGestureStart: () => void;
  onGestureAbort: (reason: string) => void;
  /** Fixed-threshold direct answer, independent of the calibrated scanning gesture: eyebrow raise = Yes. */
  onYes?: () => void;
  /** Fixed-threshold direct answer: open mouth (whistle motion) = No. */
  onNo?: () => void;
}
export interface CameraMeasurements {
  validFrames: number; invalidFrames: number; completedGestures: number;
  abortedGestures: number; lastInferenceMs: number; practiceGestures: number;
}
type Capture = { kind: 'rest' | 'active' | 'nuisance'; until: number };

export function useCameraInput(options: CameraInputOptions) {
  const videoRef = useRef<HTMLVideoElement>(null);
  // Inference owns its video element. The optional settings preview may unmount
  // without interrupting the camera used by the communication workspace.
  const captureVideo = useRef<HTMLVideoElement | null>(null);
  const optionsRef = useRef(options); optionsRef.current = options;
  const [status, setStatus] = useState<'off' | 'loading' | 'running' | 'error'>('off');
  const [error, setError] = useState('');
  const [gesture, setGestureState] = useState<CameraGesture>('mouth');
  const gestureRef = useRef<CameraGesture>('mouth');
  const [calibrationStage, setCalibrationStage] = useState<CalibrationStage>('idle');
  const stageRef = useRef<CalibrationStage>('idle');
  const [rawScore, setRawScore] = useState(0);
  const [threshold, setThreshold] = useState<number | null>(null);
  const [releaseThreshold, setReleaseThreshold] = useState<number | null>(null);
  const [ready, setReadyState] = useState(false);
  const readyRef = useRef(false);
  const [tracking, setTracking] = useState(false);
  const trackingRef = useRef(false);
  const [qualityMessage, setQualityMessage] = useState('Camera is off.');
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [measurements, setMeasurements] = useState<CameraMeasurements>({ validFrames: 0, invalidFrames: 0, completedGestures: 0, abortedGestures: 0, lastInferenceMs: 0, practiceGestures: 0 });
  const metrics = useRef(measurements);
  const detector = useRef<GestureDetector | null>(null);
  const samples = useRef({ rest: [] as number[], active: [] as number[], nuisance: [] as number[] });
  const candidateSamples = useRef<Partial<Record<CameraGesture, { rest: number[]; active: number[] }>>>({});
  const capture = useRef<Capture | null>(null);
  const savedExtra = useRef(readExtraCalibration());
  const makeExtraDetector = (key: ExtraKey) => new GestureDetector({ ...(DEFAULT_EXTRA_FIT[key]), ...(savedExtra.current[key] ?? {}), minimumHoldMs: 150 });
  const yesDetector = useRef(makeExtraDetector('yes'));
  const noDetector = useRef(makeExtraDetector('no'));
  const extraDetectorFor = (key: ExtraKey) => key === 'yes' ? yesDetector : noDetector;
  const extraCalibrating = useRef(false);
  const [extraStage, setExtraStageState] = useState<ExtraStage>('idle');
  const extraStageRef = useRef<ExtraStage>('idle');
  const setExtraStage = (value: ExtraStage) => { extraStageRef.current = value; setExtraStageState(value); };
  const [extraIndex, setExtraIndex] = useState(0);
  const extraIndexRef = useRef(0);
  const EXTRA_ROUNDS = 2;
  const EXTRA_MAX_RETRIES = 0;
  const [extraRound, setExtraRound] = useState(0);
  const extraRoundRef = useRef(0);
  const extraBaselineRef = useRef(0.25);
  const extraPeakedRef = useRef(false);
  const [extraRetry, setExtraRetry] = useState(0);
  const extraRetryRef = useRef(0);
  const [extraQuality, setExtraQuality] = useState<QuickProfile['quality'] | null>(null);
  const profiling = useRef(false);
  const [profileStage, setProfileStageState] = useState<ProfileStage>('idle');
  const profileStageRef = useRef<ProfileStage>('idle');
  const setProfileStage = (value: ProfileStage) => { profileStageRef.current = value; setProfileStageState(value); };
  const [profileIndex, setProfileIndex] = useState(0);
  const profileIndexRef = useRef(0);
  const [profileResults, setProfileResults] = useState<ProfileResult[]>([]);
  const profileResultsRef = useRef<ProfileResult[]>([]);
  const model = useRef<FaceLandmarker | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const raf = useRef(0); const generation = useRef(0);
  const lastFrame = useRef(0);
  const setReady = (value: boolean) => { readyRef.current = value; setReadyState(value); };
  const setStage = (value: CalibrationStage) => { stageRef.current = value; setCalibrationStage(value); };

  const dispatch = useCallback((events: GestureEvent[]) => {
    for (const event of events) {
      if (stageRef.current === 'practice') {
        if (event.type === 'activate') {
          metrics.current.practiceGestures++;
          setMeasurements({ ...metrics.current });
        }
        continue;
      }
      if (!optionsRef.current.enabled || !readyRef.current) continue;
      if (event.type === 'start') optionsRef.current.onGestureStart();
      if (event.type === 'activate') { metrics.current.completedGestures++; optionsRef.current.onActivate(); }
      if (event.type === 'abort') { metrics.current.abortedGestures++; optionsRef.current.onGestureAbort(event.reason ?? 'Gesture interrupted'); }
    }
  }, []);

  const unavailable = useCallback((reason: string) => {
    dispatch(detector.current?.reset(performance.now(), reason) ?? []);
    if (capture.current) {
      capture.current = null; setRemainingSeconds(0);
      if (profiling.current) {
        profiling.current = false; setProfileStage('idle');
        setError('Profiling was interrupted. Keep your face visible and try again.');
      } else if (extraCalibrating.current) {
        // A single dropped frame (a blink, a brief head turn) is normal and should not abandon
        // calibration entirely — just pause; the valid-frame handler below re-arms the same
        // phase automatically once tracking recovers.
      } else {
        stageRef.current = 'failed'; setCalibrationStage('failed');
        setError('Calibration was interrupted. Repeat setup when tracking is stable.');
      }
    }
    if (trackingRef.current && optionsRef.current.enabled && readyRef.current) optionsRef.current.onUnavailable(reason);
    trackingRef.current = false; setTracking(false); setQualityMessage(reason);
  }, [dispatch]);

  const stop = useCallback(() => {
    generation.current++; cancelAnimationFrame(raf.current);
    unavailable('Camera stopped. Your message is retained.');
    stream.current?.getTracks().forEach(track => track.stop()); stream.current = null;
    model.current?.close(); model.current = null;
    if (captureVideo.current) { captureVideo.current.pause(); captureVideo.current.srcObject = null; captureVideo.current = null; }
    if (videoRef.current) videoRef.current.srcObject = null;
    capture.current = null; setRemainingSeconds(0); setStatus('off');
  }, [unavailable]);

  const attachPreview = useCallback((element: HTMLVideoElement | null) => {
    videoRef.current = element;
    if (element && stream.current) {
      element.srcObject = stream.current;
      void element.play().catch(() => { /* Preview failure does not authorize any selection. */ });
    }
  }, []);

  const finalizeExtra = (key: ExtraKey, fit: ExtraFit, now: number) => {
    extraDetectorFor(key).current = new GestureDetector({ activationThreshold: fit.activationThreshold, releaseThreshold: fit.releaseThreshold, minimumHoldMs: 150 });
    savedExtra.current = { ...savedExtra.current, [key]: fit };
    if (key === 'yes') {
      gestureRef.current = 'eyebrows'; setGestureState('eyebrows');
      detector.current = new GestureDetector({ activationThreshold: fit.activationThreshold, releaseThreshold: fit.releaseThreshold });
      setThreshold(fit.activationThreshold); setReleaseThreshold(fit.releaseThreshold);
      metrics.current.practiceGestures = 0; setReady(true);
      try { localStorage.setItem(CALIBRATION_KEY, JSON.stringify({ gesture: 'eyebrows', activationThreshold: fit.activationThreshold, releaseThreshold: fit.releaseThreshold, calibratedAt: Date.now() })); } catch { /* Storage may be unavailable. */ }
    }
    const nextIndex = extraIndexRef.current + 1;
    extraRoundRef.current = 0; setExtraRound(0);
    extraRetryRef.current = 0; setExtraRetry(0);
    setExtraQuality(null);
    if (nextIndex < EXTRA_CANDIDATES.length) {
      extraIndexRef.current = nextIndex; setExtraIndex(nextIndex);
      samples.current = { rest: [], active: [], nuisance: [] };
      capture.current = { kind: 'rest', until: now + 6000 };
      setExtraStage('rest');
    } else {
      extraCalibrating.current = false; setExtraStage('done');
      try { localStorage.setItem(EXTRA_KEY_STORAGE, JSON.stringify(savedExtra.current)); } catch { /* Storage may be unavailable. */ }
    }
  };

  const start = useCallback(async () => {
    stop(); const token = generation.current; setStatus('loading'); setError('');
    const cancelled = () => token !== generation.current;
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('Camera access needs localhost or HTTPS and a supported browser.');
      setQualityMessage('Waiting for camera permission. Choose Allow in your browser (15-second limit).');
      const acquired = await startupDeadline(
        navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' }, audio: false }),
        15000, 'The browser did not finish the camera permission request. Allow camera access in site permissions, or open this app in Chrome or Edge and try again.',
        cancelled, lateStream => lateStream.getTracks().forEach(track => track.stop()),
      );
      if (token !== generation.current) { acquired.getTracks().forEach(track => track.stop()); return; }
      stream.current = acquired;
      const video = document.createElement('video');
      video.muted = true; video.autoplay = true; video.playsInline = true;
      captureVideo.current = video;
      setQualityMessage('Camera permission received. Starting the video stream…');
      video.srcObject = acquired;
      await startupDeadline(video.play(), 8000, 'The camera stream did not start. Close other camera apps and try Chrome or Edge.', cancelled);
      if (cancelled()) return;
      if (videoRef.current) {
        videoRef.current.srcObject = acquired;
        void videoRef.current.play().catch(() => { /* The capture element remains independent. */ });
      }
      setQualityMessage('Loading the local face model. No frames leave this device…');
      const vision = await startupDeadline(FilesetResolver.forVisionTasks('/models/wasm'), 10000, 'Local camera runtime did not load. Reload the app and check that model assets are installed.', cancelled);
      if (cancelled()) return;
      const loaded = await startupDeadline(FaceLandmarker.createFromOptions(vision, { baseOptions: { modelAssetPath: '/models/face_landmarker.task', delegate: 'CPU' }, runningMode: 'VIDEO', numFaces: 2, outputFaceBlendshapes: true, minFaceDetectionConfidence: 0.65, minFacePresenceConfidence: 0.65, minTrackingConfidence: 0.65 }), 15000, 'The local face model did not finish loading. Try Chrome or Edge; switch access remains available.', cancelled, lateModel => lateModel.close());
      if (token !== generation.current) { loaded.close(); return; }
      model.current = loaded;
      acquired.getVideoTracks().forEach(track => { track.onended = () => unavailable('Camera disconnected.'); track.onmute = () => unavailable('Camera stream interrupted.'); });
      setStatus('running'); setQualityMessage('Looking for one face…');
      let lastVideoTime = -1; let lastPublish = 0;
      lastFrame.current = performance.now();
      const loop = () => {
        if (token !== generation.current) return;
        const now = performance.now();
        if (document.hidden) unavailable('Camera input paused while this window is hidden.');
        else if (video.readyState >= 2 && video.currentTime !== lastVideoTime && now - lastFrame.current >= 65) {
          lastVideoTime = video.currentTime; lastFrame.current = now;
          try {
            const before = performance.now();
            const result = loaded.detectForVideo(video, now);
            const after = performance.now();
            metrics.current.lastInferenceMs = after - before;
            const points = result.faceLandmarks[0];
            const features = result.faceBlendshapes[0]?.categories;
            const score = scoreFor(gestureRef.current, features);
            const keyPoints = points && [1, 33, 263, 61, 291].map(i => points[i]);
            const valid = result.faceLandmarks.length === 1 && score !== undefined && Number.isFinite(score)
              && keyPoints?.every(p => p && Number.isFinite(p.x) && Number.isFinite(p.y) && p.x > 0.015 && p.x < 0.985 && p.y > 0.015 && p.y < 0.985)
              && Math.abs(points[33].x - points[263].x) > 0.08 && after - before < 350;
            if (!valid) {
              metrics.current.invalidFrames++;
              // A single dropped frame is normal (a blink, a slight head turn). During calibration,
              // tolerate it silently rather than aborting the in-progress capture window.
              if (!extraCalibrating.current) unavailable(result.faceLandmarks.length > 1 ? 'More than one face is visible. Keep only the intended user in view.' : 'Tracking unavailable. Keep your face visible, facing the camera, in good light.');
            } else {
              metrics.current.validFrames++;
              trackingRef.current = true; setTracking(true); setQualityMessage('One face tracked.');
              if (capture.current) {
                const sampleValue = extraCalibrating.current ? scoreForExtra[EXTRA_CANDIDATES[extraIndexRef.current].key](features) : score;
                if (sampleValue !== undefined) samples.current[capture.current.kind].push(sampleValue);
                // Yes/No only: once we have a rest baseline, end the active window the moment a
                // clean raise-then-release is actually detected, instead of always waiting out
                // the fixed window -- so a real gesture is recognized right away.
                if (extraCalibrating.current && capture.current.kind === 'active' && sampleValue !== undefined) {
                  const margin = Math.max(0.08, (1 - extraBaselineRef.current) * 0.35);
                  if (!extraPeakedRef.current && sampleValue > extraBaselineRef.current + margin) extraPeakedRef.current = true;
                  else if (extraPeakedRef.current && sampleValue < extraBaselineRef.current + margin * 0.3) capture.current.until = now;
                }
                setRemainingSeconds(Math.max(0, Math.ceil((capture.current.until - now) / 1000)));
                if (now >= capture.current.until) {
                  const kind = capture.current.kind; capture.current = null; setRemainingSeconds(0);
                  if (extraCalibrating.current) {
                    if (kind === 'rest') {
                      extraBaselineRef.current = samples.current.rest.length >= 5 ? quantile(samples.current.rest, 0.9) : 0.25;
                      extraPeakedRef.current = false;
                      capture.current = { kind: 'active', until: now + 8000 };
                      setExtraStage('active');
                    } else if (kind === 'active') {
                      if (extraRoundRef.current < EXTRA_ROUNDS - 1) {
                        extraRoundRef.current += 1; setExtraRound(extraRoundRef.current);
                        capture.current = { kind: 'rest', until: now + 6000 };
                        setExtraStage('rest');
                      } else {
                        const key = EXTRA_CANDIDATES[extraIndexRef.current].key;
                        const profile = quickProfile(samples.current.rest, samples.current.active);
                        setExtraQuality(profile.quality);
                        if (profile.quality === 'unclear' && extraRetryRef.current < EXTRA_MAX_RETRIES) {
                          extraRetryRef.current += 1; setExtraRetry(extraRetryRef.current);
                          extraRoundRef.current = 0; setExtraRound(0);
                          samples.current = { rest: [], active: [], nuisance: [] };
                          capture.current = { kind: 'rest', until: now + 6000 };
                          setExtraStage('rest');
                        } else {
                          // Always keep the best available fit and move straight on -- no disclaimer step.
                          finalizeExtra(key, fitLenient(samples.current.rest, samples.current.active), now);
                        }
                      }
                    }
                  } else if (profiling.current) {
                    if (kind === 'rest') {
                      capture.current = { kind: 'active', until: now + 4000 };
                      setProfileStage('active');
                    } else if (kind === 'active') {
                      const candidate = PROFILE_CANDIDATES[profileIndexRef.current];
                      const fit = quickProfile(samples.current.rest, samples.current.active);
                      candidateSamples.current[candidate.gesture] = { rest: samples.current.rest, active: samples.current.active };
                      profileResultsRef.current = [...profileResultsRef.current, { gesture: candidate.gesture, label: candidate.label, separation: fit.separation, quality: fit.quality }];
                      setProfileResults(profileResultsRef.current);
                      const nextIndex = profileIndexRef.current + 1;
                      if (nextIndex < PROFILE_CANDIDATES.length) {
                        profileIndexRef.current = nextIndex; setProfileIndex(nextIndex);
                        gestureRef.current = PROFILE_CANDIDATES[nextIndex].gesture; setGestureState(PROFILE_CANDIDATES[nextIndex].gesture);
                        samples.current = { rest: [], active: [], nuisance: [] };
                        capture.current = { kind: 'rest', until: now + 2500 };
                        setProfileStage('rest');
                      } else {
                        profiling.current = false; setProfileStage('done');
                      }
                    }
                  } else if (kind === 'rest') setStage('active-ready');
                  else if (kind === 'active') setStage('nuisance-ready');
                  else {
                    try {
                      const fit = fitCalibration(samples.current.rest, samples.current.active, samples.current.nuisance);
                      detector.current = new GestureDetector(fit); setThreshold(fit.activationThreshold); setReleaseThreshold(fit.releaseThreshold);
                      metrics.current.practiceGestures = 0; setStage('practice'); setError('');
                    } catch (e) { setStage('failed'); setError(e instanceof Error ? e.message : 'Calibration failed.'); }
                  }
                }
              } else if ((optionsRef.current.enabled && readyRef.current) || stageRef.current === 'practice') {
                dispatch(detector.current?.observe(score!, after, true) ?? []);
                const fires = (detector_: React.MutableRefObject<GestureDetector>, value: number | undefined) =>
                  value !== undefined && detector_.current.observe(value, after, true).some(e => e.type === 'activate');
                if (fires(yesDetector, scoreForExtra.yes(features))) optionsRef.current.onYes?.();
                if (fires(noDetector, scoreForExtra.no(features))) optionsRef.current.onNo?.();
              }
              if (now - lastPublish > 120) setRawScore(score!);
            }
          } catch (e) { unavailable('Face model could not process this frame.'); setError(e instanceof Error ? e.message : 'Model inference failed.'); }
        } else if (now - lastFrame.current > 500) unavailable('Camera observations are stale.');
        if (now - lastPublish > 200) { setMeasurements({ ...metrics.current }); lastPublish = now; }
        raf.current = requestAnimationFrame(loop);
      };
      raf.current = requestAnimationFrame(loop);
    } catch (e) {
      if (token !== generation.current) return;
      stop(); setStatus('error');
      const name = e instanceof Error ? e.name : '';
      const message = name === 'NotAllowedError' ? 'Camera permission was denied. Allow camera access in your browser site settings, then try again.'
        : name === 'NotFoundError' ? 'No camera was found on this device.'
        : name === 'NotReadableError' ? 'The camera could not be read. It may be in use by another app. Close other camera apps and retry.'
        : e instanceof Error ? e.message : 'Camera could not start.';
      setError(`Camera unavailable: ${message} Switch access remains available.`);
    }
  }, [dispatch, stop, unavailable]);

  useEffect(() => {
    dispatch(detector.current?.reset(performance.now(), 'Active input changed') ?? []);
  }, [options.enabled, dispatch]);

  useEffect(() => {
    const hidden = () => { if (document.hidden) unavailable('Window hidden. Camera input paused.'); };
    document.addEventListener('visibilitychange', hidden);
    return () => { document.removeEventListener('visibilitychange', hidden); stop(); };
  }, [stop, unavailable]);

  const beginCalibration = () => {
    dispatch(detector.current?.reset(performance.now(), 'Calibration started') ?? []);
    if (readyRef.current && optionsRef.current.enabled) optionsRef.current.onUnavailable('Camera calibration started.');
    setReady(false); detector.current = null; capture.current = null;
    samples.current = { rest: [], active: [], nuisance: [] }; metrics.current.practiceGestures = 0;
    setThreshold(null); setReleaseThreshold(null); setError(''); setStage('rest-ready');
  };
  const setGesture = (value: CameraGesture) => {
    beginCalibration(); gestureRef.current = value; setGestureState(value);
  };
  const captureKind = (kind: Capture['kind'], duration: number) => {
    if (!trackingRef.current) { setError('A tracked face is required before recording calibration.'); return; }
    if (stageRef.current !== `${kind}-ready`) return;
    samples.current[kind] = []; capture.current = { kind, until: performance.now() + duration };
    setStage(`${kind}-recording` as CalibrationStage); setError('');
  };
  const finishCalibration = () => {
    if (stageRef.current !== 'practice' || metrics.current.practiceGestures < 3) return;
    detector.current?.reset(performance.now()); setReady(true); setStage('complete');
    if (threshold !== null && releaseThreshold !== null) {
      try { localStorage.setItem(CALIBRATION_KEY, JSON.stringify({ gesture: gestureRef.current, activationThreshold: threshold, releaseThreshold, calibratedAt: Date.now() })); } catch { /* Storage may be unavailable. */ }
    }
  };
  const startProfiling = () => {
    dispatch(detector.current?.reset(performance.now(), 'Profiling started') ?? []);
    if (readyRef.current && optionsRef.current.enabled) optionsRef.current.onUnavailable('Camera profiling started.');
    setReady(false); detector.current = null; capture.current = null;
    profiling.current = true; profileIndexRef.current = 0; setProfileIndex(0);
    profileResultsRef.current = []; setProfileResults([]); candidateSamples.current = {};
    setThreshold(null); setReleaseThreshold(null); setError(''); setStage('idle');
    gestureRef.current = PROFILE_CANDIDATES[0].gesture; setGestureState(PROFILE_CANDIDATES[0].gesture);
    samples.current = { rest: [], active: [], nuisance: [] };
    capture.current = { kind: 'rest', until: performance.now() + 2500 };
    setProfileStage('rest');
  };
  const chooseProfiledGesture = (value: CameraGesture) => {
    const saved = candidateSamples.current[value];
    gestureRef.current = value; setGestureState(value);
    samples.current = { rest: saved?.rest ?? [], active: saved?.active ?? [], nuisance: [] };
    metrics.current.practiceGestures = 0; setThreshold(null); setReleaseThreshold(null); setError('');
    setProfileStage('idle'); setStage('nuisance-ready');
  };
  const startExtraCalibration = () => {
    dispatch(detector.current?.reset(performance.now(), 'Learning your quick answers') ?? []);
    capture.current = null;
    extraCalibrating.current = true; extraIndexRef.current = 0; setExtraIndex(0);
    extraRoundRef.current = 0; setExtraRound(0); extraRetryRef.current = 0; setExtraRetry(0); setExtraQuality(null);
    samples.current = { rest: [], active: [], nuisance: [] };
    capture.current = { kind: 'rest', until: performance.now() + 6000 };
    setExtraStage('rest');
  };
  /** Lets the caller (which owns narration) shorten or extend the current rest/active
   * capture window once it knows the spoken instruction has actually finished — so the
   * gesture is captured right after the person hears it, not on a generic fixed timer. */
  const setExtraCaptureDeadline = (msFromNow: number) => {
    if (capture.current) capture.current.until = performance.now() + msFromNow;
  };
  const applySavedCalibration = (saved: SavedCalibration) => {
    gestureRef.current = saved.gesture; setGestureState(saved.gesture);
    detector.current = new GestureDetector({ activationThreshold: saved.activationThreshold, releaseThreshold: saved.releaseThreshold });
    setThreshold(saved.activationThreshold); setReleaseThreshold(saved.releaseThreshold);
    metrics.current.practiceGestures = 0; setReady(true); setStage('complete'); setProfileStage('idle');
  };
  const driftWarning = measurements.completedGestures + measurements.abortedGestures >= 8
    && measurements.abortedGestures / (measurements.completedGestures + measurements.abortedGestures) > 0.35;

  return { videoRef, attachPreview, start, stop, status, error, gesture, setGesture, calibrationStage,
    beginCalibration, captureRest: () => captureKind('rest', 5000), captureActive: () => captureKind('active', 10000),
    captureNuisance: () => captureKind('nuisance', 6000), finishCalibration, rawScore, threshold, releaseThreshold,
    profileStage, profileIndex, profileCandidate: PROFILE_CANDIDATES[profileIndex], profileResults,
    startProfiling, chooseProfiledGesture, applySavedCalibration, driftWarning,
    extraStage, extraIndex, extraCandidate: EXTRA_CANDIDATES[extraIndex], startExtraCalibration,
    extraRound, extraRounds: EXTRA_ROUNDS, extraRetry, extraQuality, setExtraCaptureDeadline,
    ready, tracking, qualityMessage, remainingSeconds, measurements };
}

export type CameraInput = ReturnType<typeof useCameraInput>;
