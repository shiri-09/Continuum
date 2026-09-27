import { PROFILE_CANDIDATES, type CameraGesture, type CameraInput } from '../input/useCameraInput';

export function CameraAccess({ camera }: { camera: CameraInput }) {
  const active = camera.status === 'running';
  const stage = camera.calibrationStage;
  const info = PROFILE_CANDIDATES.find(c => c.gesture === camera.gesture) ?? PROFILE_CANDIDATES[0];
  const movement = info.instruction.replace(/\.$/, '').replace(/^./, c => c.toLowerCase());
  const recording = stage.endsWith('recording');
  const step = stage.startsWith('rest') ? 1 : stage.startsWith('active') ? 2 : stage.startsWith('nuisance') ? 3 : stage === 'practice' || stage === 'complete' ? 4 : 0;
  const recordingInstruction = stage === 'rest-recording' ? 'Keep your face in its comfortable resting position.'
    : stage === 'active-recording' ? `Repeatedly ${movement}. Hold for about half a second; rest for about a second between movements.`
    : 'Blink and look slightly around without making your chosen selection movement. Keep your face visible.';
  return <section className="camera-access" aria-label="Camera access setup">
    <p><strong>A helper may need to complete these setup controls.</strong> The person using the app only needs one comfortable, repeatable movement. After setup, the highlight moves automatically; completing that movement selects the highlighted choice.</p>
    <p>To write a new message, select <strong>Write something else</strong>, then a letter group, then a letter. You do not need to move a mouse to each letter. Camera access does not recognize speech or follow where you look.</p>
    <div className="camera-preview-wrap">
      <video ref={camera.attachPreview} className="camera-preview" autoPlay muted playsInline aria-label="Live local camera preview" style={{ width: '100%', maxHeight: 230, objectFit: 'cover', transform: 'scaleX(-1)', borderRadius: 14, background: '#162421' }} />
      <div className="camera-status" role="status"><strong>{active ? camera.tracking ? 'Face detected. ' : 'Face not ready. ' : ''}</strong>{camera.qualityMessage}</div>
    </div>
    <p className="muted">Position the camera so only the intended user’s face is visible, in good light. Video is processed on this device and is not saved.</p>
    <div className="button-row">
      {active || camera.status === 'loading' ? <button onClick={camera.stop}>Stop camera</button> : <button onClick={() => void camera.start()}>Start camera</button>}
      {active && (stage === 'idle' || stage === 'complete') && <button disabled={!camera.tracking} onClick={camera.beginCalibration}>{stage === 'complete' ? 'Restart all 4 setup steps' : 'Begin 4-step setup'}</button>}
    </div>
    {camera.error && <p role="alert" className="error-message">{camera.error}</p>}
    {(camera.status === 'off' || camera.status === 'loading' || camera.status === 'error') && <div><p><strong>Helper: choose Start camera, then Allow in the browser’s camera prompt.</strong> If no prompt appears or the preview stays blank, open this app’s address in a separate Chrome or Edge window and allow camera access there.</p><p className="muted">Switch access uses Space and works with any button that can send it — a keyboard, an adapted switch, a finger or foot pedal, or a cheap sip-puff adapter. Camera input requires a usable voluntary face movement; it is not suitable for everyone.</p></div>}
    {active && <>
      <label>Choose a movement the person can make comfortably <select value={camera.gesture} onChange={e => camera.setGesture(e.target.value as CameraGesture)} disabled={recording}>
        {PROFILE_CANDIDATES.map(c => <option key={c.gesture} value={c.gesture}>{c.label}</option>)}
      </select></label>
      <ol aria-label="Four camera setup steps">
        {['Rest for 5 seconds', 'Repeat your selection movement for 10 seconds', 'Make ordinary movements for 6 seconds', 'Complete 3 practice selections'].map((label, index) => <li key={label} aria-current={step === index + 1 ? 'step' : undefined}>{step > index + 1 || stage === 'complete' ? '✓ ' : ''}{label}{step === index + 1 && stage !== 'complete' ? ' — current step' : ''}</li>)}
      </ol>
      {stage === 'idle' && <p>Choose a movement, then begin setup. Camera selections are disabled until all four steps are complete.</p>}
      {stage === 'rest-ready' && <div><h4>Step 1 of 4: stay at rest</h4><p>Helper: start the sample. User: keep your natural resting position for five seconds.</p><button disabled={!camera.tracking} onClick={camera.captureRest}>Start rest sample · 5 seconds</button></div>}
      {stage === 'active-ready' && <div><h4>Step 2 of 4: show your selection movement</h4><p>Helper: start the sample. User: repeatedly {movement}. Hold for about half a second and rest for about a second between repetitions. Stop if uncomfortable.</p><button disabled={!camera.tracking} onClick={camera.captureActive}>Start movement sample · 10 seconds</button></div>}
      {stage === 'nuisance-ready' && <div><h4>Step 3 of 4: show movements to ignore</h4><p>Helper: start the sample. User: blink, shift your gaze slightly and make ordinary comfortable movements without the chosen selection gesture. Keep your face in view.</p><button disabled={!camera.tracking} onClick={camera.captureNuisance}>Start ordinary-movement sample · 6 seconds</button></div>}
      {recording && <div role="status"><h4>Step {step} of 4 is running</h4><p>{recordingInstruction}</p><p><strong>{camera.remainingSeconds > 0 ? `${camera.remainingSeconds} seconds remaining` : 'Starting sample…'}</strong> · Measuring movement only. No choices are selected and no video is saved.</p></div>}
      {stage === 'practice' && <div><h4>Step 4 of 4: try three separate selections</h4><p>User: {movement} three times. Hold for about half a second and rest for about a second between actions. The counter increases only after the movement finishes.</p><p role="status"><strong>Completed: {Math.min(camera.measurements.practiceGestures, 3)} of 3</strong></p><button disabled={camera.measurements.practiceGestures < 3 || !camera.tracking} onClick={camera.finishCalibration}>Finish setup</button><p>Helper: select Finish setup when the counter reaches 3.</p></div>}
      {stage === 'complete' && <div className="success-message"><strong>All 4 setup steps are complete.</strong><p>Helper: select the button below to use camera access. User: make one complete movement to start scanning. Then wait for your choice to be highlighted and make another complete movement to select it.</p><p>Try a few choices first. If normal movements select choices by mistake, stop and repeat setup.</p></div>}
      {stage === 'failed' && <div><p>Setup did not finish. Read the error above, make sure the face is clearly visible, then repeat the four steps.</p><button disabled={!camera.tracking} onClick={camera.beginCalibration}>Repeat all 4 setup steps</button></div>}
      <div><label>Live movement level <meter min="0" max="1" value={camera.rawScore} aria-label="Observed movement score" style={{ width: '100%' }} /></label><p className="muted">{camera.tracking ? 'The bar should change when you make the chosen movement. It is a model score, not proof of an intended selection.' : 'No reliable face tracking. Reposition the camera before continuing.'}</p></div>
      <details><summary>Technical input measurements</summary><p>Movement score: {camera.rawScore.toFixed(3)} · Activate: {camera.threshold?.toFixed(3) ?? 'not fitted'} · Release: {camera.releaseThreshold?.toFixed(3) ?? 'not fitted'}</p><p>Valid frames: {camera.measurements.validFrames} · Rejected frames: {camera.measurements.invalidFrames} · Last inference: {camera.measurements.lastInferenceMs.toFixed(0)} ms</p><p>Completed gestures: {camera.measurements.completedGestures} · Interrupted gestures: {camera.measurements.abortedGestures}. Unintended actions require human labels.</p></details>
    </>}
  </section>;
}

export default CameraAccess;
