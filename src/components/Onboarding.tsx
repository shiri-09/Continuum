import {useEffect,useRef,useState} from 'react';
import './Onboarding.css';
import {Check,Volume2,VolumeX,Waves} from 'lucide-react';
import {EXTRA_CANDIDATES,type CameraInput} from '../input/useCameraInput';
import {useEyeTracker} from '../input/useEyeTracker';
import {speakHuman} from '../intelligence/voiceEngine';
export type SetupSignals={activate:()=>void;start:()=>void;abort:()=>void;lost:(reason:string)=>void;yes:()=>void;no:()=>void};
type Props={camera:CameraInput;register:(signals:SetupSignals|null)=>void;setInput:(input:'camera'|'switch')=>void;savePhrase:(text:string)=>void;finish:()=>void};
const phrases=['Please give me more time.','Please ask me directly.','That is not what I meant.','I need a break.'];
const introduction=[
 {title:'Hi.',text:'Hi.'},
 {title:'Meet Continuum',text:'I’m Continuum.'},
 {title:'The problem',text:'Assistive technology is often expensive and hard to find.'},
 {title:'Who this is for',text:'Inspired by the systems built for people like Stephen Hawking.'},
 {title:'What I do',text:'I learn your best movement, then help you speak and act.'},
];
type Step='welcome'|'cameraOn'|'extraCalibrate'|'gazeCalibrate'|'yes'|'no'|'phrases'|'complete';
const GAZE_POINTS:[number,number][]=[[10,10],[30,10],[50,10],[70,10],[90,10],[10,35],[50,35],[90,35],[10,50],[30,50],[50,50],[70,50],[90,50],[10,65],[50,65],[90,65],[10,90],[30,90],[50,90],[70,90],[90,90]];
export function Onboarding({camera,register,setInput,savePhrase,finish}:Props){
 const [step,setStep]=useState<Step>('welcome');const [input,setLocalInput]=useState<'camera'|'switch'>('switch');
 const [introIndex,setIntroIndex]=useState(0);
 const [index,setIndex]=useState(0);const [phraseIndex,setPhraseIndex]=useState(0);const [saved,setSaved]=useState<string[]>([]);
 const [feedback,setFeedback]=useState('');const [voiceOn,setVoiceOn]=useState(true);const [speaking,setSpeaking]=useState(false);
 const [voices,setVoices]=useState<SpeechSynthesisVoice[]>([]);const [held,setHeld]=useState(false);const [paused,setPaused]=useState(false);
 const [revealed,setRevealed]=useState(false);
 const [gazeIndex,setGazeIndex]=useState(0);
 const [gazePoint,setGazePoint]=useState<{x:number;y:number}|null>(null);
 const gazeHoverRef=useRef<{index:number;since:number}|null>(null);
 const recordIntervalRef=useRef<ReturnType<typeof setInterval>|null>(null);
 const autoCalibrateStarted=useRef(false);
 const latched=useRef<number|null>(null);const pressed=useRef(false);const generation=useRef(0);const speechId=useRef(0);
 const humanHandle=useRef<{cancel:()=>void}|null>(null);
 useEffect(()=>{const timer=setTimeout(()=>setRevealed(true),900);return()=>clearTimeout(timer)},[]);
 const practice=step==='yes'||step==='no'||step==='phrases'||step==='complete';
 const gazeHistoryRef=useRef<{x:number;y:number}[]>([]);
 const eyeTracker=useEyeTracker({enabled:step==='gazeCalibrate'||practice,onGaze:point=>{
  // Average a rolling window of raw points rather than a single exponential step — WebGazer's
  // frame-to-frame output is noisy enough that one-step smoothing still looks shaky.
  const hist=gazeHistoryRef.current;
  hist.push(point);
  if(hist.length>8)hist.shift();
  const smoothed={x:hist.reduce((a,p)=>a+p.x,0)/hist.length,y:hist.reduce((a,p)=>a+p.y,0)/hist.length};
  setGazePoint(smoothed);
  if(!practice||paused)return;
  const el=document.elementFromPoint(smoothed.x,smoothed.y)?.closest<HTMLElement>('[data-gaze-id]');
  const idxAttr=el?.dataset.gazeId;
  if(idxAttr===undefined)return;
  const idx=Number(idxAttr);
  const now=performance.now();
  if(gazeHoverRef.current?.index!==idx){gazeHoverRef.current={index:idx,since:now};return}
  if(now-gazeHoverRef.current.since>=700)setIndex(idx);
 }});
 const cameraOnPrompt=camera.status==='error'?"Your camera did not start. Select Retry camera, or use a switch instead."
  :camera.status!=='running'?"Turning on your camera…"
  :!camera.tracking?"Keep your face visible and centred so I can see you clearly."
  :"Getting ready to learn your movements…";
 const extraPrompt=camera.extraStage==='rest'?`Let's learn your ${camera.extraCandidate.label.toLowerCase()}. Stay relaxed and still for a moment.`
  :camera.extraStage==='active'?camera.extraCandidate.instruction
  :'Getting ready…';
 const prompt=step==='welcome'?introduction[introIndex].text:step==='cameraOn'?cameraOnPrompt:step==='extraCalibrate'?extraPrompt:step==='gazeCalibrate'?"Now let’s calibrate your eye tracking. Just look at each dot as it moves around the screen.":step==='yes'?"Let’s practise Yes. Wait until Yes is highlighted, then make your movement or press your switch.":step==='no'?"You selected Yes. Now let’s practise No. Wait until No is highlighted, then select it.":step==='phrases'?`Would you like to save this message? ${phrases[phraseIndex]}`:`Setup is complete. You saved ${saved.length} personal messages. You can now speak, chat with me, or prepare a computer action.`;
 const choiceLabels=step==='complete'?['Open workspace','Repeat practice']:['Yes','No'];
 const current=useRef({step,index,paused,phraseIndex});current.current={step,index,paused,phraseIndex};
 useEffect(()=>{const update=()=>setVoices(window.speechSynthesis?.getVoices().filter(v=>v.localService)??[]);update();window.speechSynthesis?.addEventListener('voiceschanged',update);return()=>window.speechSynthesis?.removeEventListener('voiceschanged',update)},[]);
 const speechStartedRef=useRef(false);
 const narrate=(text:string)=>{
  if(humanHandle.current||window.speechSynthesis?.speaking){humanHandle.current?.cancel();window.speechSynthesis?.cancel()}
  speechStartedRef.current=false;
  if(!voiceOn)return;
  const id=++speechId.current;
  const fallback=()=>{
   if(id!==speechId.current||!window.speechSynthesis||!voices.length)return;
   const utterance=new SpeechSynthesisUtterance(text);
   utterance.voice=voices.find(v=>/zira|jenny|aria/i.test(v.name))??voices.find(v=>v.lang.startsWith('en'))??voices[0];
   utterance.rate=.88;utterance.pitch=1.03;
   utterance.onstart=()=>{if(id===speechId.current){speechStartedRef.current=true;setSpeaking(true)}};
   utterance.onend=()=>{if(id===speechId.current)setSpeaking(false)};
   utterance.onerror=()=>{if(id===speechId.current)setSpeaking(false)};
   window.speechSynthesis.speak(utterance);
  };
  if(localStorage.getItem('continuum.voiceEngine')!=='human'){fallback();return}
  humanHandle.current=speakHuman(text,{
   onStart:()=>{if(id===speechId.current){speechStartedRef.current=true;setSpeaking(true)}},
   onEnd:()=>{if(id===speechId.current)setSpeaking(false)},
   onError:fallback,
  });
 };
 useEffect(()=>{if(!revealed)return;narrate(prompt);return()=>{speechId.current++;humanHandle.current?.cancel();window.speechSynthesis?.cancel();setSpeaking(false)}},[prompt,voiceOn,voices.length,revealed]);
 const beatAdvancedRef=useRef(false);
 useEffect(()=>{beatAdvancedRef.current=false},[introIndex,step]);
 useEffect(()=>{
  if(step!=='welcome'||!revealed)return;
  const goNext=()=>{if(beatAdvancedRef.current)return;beatAdvancedRef.current=true;if(introIndex<introduction.length-1)setIntroIndex(i=>i+1);else beginInput('camera')};
  if(speechStartedRef.current&&!speaking){const timer=setTimeout(goNext,1100);return()=>clearTimeout(timer)}
  const words=introduction[introIndex].text.split(/\s+/).length;
  const capMs=Math.max(2600,Math.min(6200,900+words*380));
  const cap=setTimeout(goNext,capMs);
  return()=>clearTimeout(cap);
 },[step,introIndex,revealed,speaking]);
 useEffect(()=>{setIndex(0);latched.current=null;setHeld(false);setPaused(false);generation.current++;setFeedback('')},[step,phraseIndex]);
 useEffect(()=>{if(!practice||held||paused||speaking||(input==='camera'&&eyeTracker.ready))return;const timer=setTimeout(()=>setIndex(i=>(i+1)%2),1900);return()=>clearTimeout(timer)},[practice,held,paused,speaking,index,step,input,eyeTracker.ready]);
 useEffect(()=>{if(step==='cameraOn'&&camera.status==='running'&&camera.tracking&&!autoCalibrateStarted.current){autoCalibrateStarted.current=true;setInput('camera');setStep('extraCalibrate');camera.startExtraCalibration()}},[step,camera.status,camera.tracking,camera]);
 // Once the spoken instruction for this phase genuinely finishes, capture right after it —
 // rest ends the moment its narration stops; active gives a full 3s to perform the gesture
 // after ITS narration stops. Fixed timers above remain only as a safety cap if speech fails.
 useEffect(()=>{
  if(step!=='extraCalibrate'||!speechStartedRef.current||speaking)return;
  if(camera.extraStage==='rest')camera.setExtraCaptureDeadline(50);
  else if(camera.extraStage==='active')camera.setExtraCaptureDeadline(3000);
 },[step,camera.extraStage,speaking,camera]);
 useEffect(()=>{if(step==='extraCalibrate'&&camera.extraStage==='done'){setGazeIndex(0);setStep('gazeCalibrate')}},[step,camera.extraStage]);
 useEffect(()=>{
  if(step!=='gazeCalibrate')return;
  const [px,py]=GAZE_POINTS[gazeIndex];
  const x=window.innerWidth*px/100;const y=window.innerHeight*py/100;
  // Give the eye ~500ms to actually settle on the new dot (it just jumped position) before
  // training on it — recording during the saccade itself teaches WebGazer wrong data.
  const settleTimer=setTimeout(()=>{
   recordIntervalRef.current=setInterval(()=>eyeTracker.recordPoint(x,y),100);
  },500);
  const advanceTimer=setTimeout(()=>{if(gazeIndex<GAZE_POINTS.length-1)setGazeIndex(i=>i+1);else setStep('yes')},2200);
  return()=>{clearTimeout(settleTimer);if(recordIntervalRef.current)clearInterval(recordIntervalRef.current);clearTimeout(advanceTimer)};
 },[step,gazeIndex,eyeTracker.recordPoint]);
 const choose=(selected:number)=>{
  const state=current.current;if(!['yes','no','phrases','complete'].includes(state.step))return;
  if(state.paused){setPaused(false);setFeedback('Selection resumed. Wait for the answer you want.');return}
  if(state.step==='yes'){if(selected===0)setStep('no');else{setFeedback('You selected No. This is practice: select Yes when it is highlighted.');narrate('You selected No. To practise Yes, wait until Yes is highlighted.')}}
  if(state.step==='no'){if(selected===1)setStep('phrases');else{setFeedback('You selected Yes. This time, wait for No.');narrate('You selected Yes. This time, wait for No.')}}
  if(state.step==='phrases'){if(selected===0){savePhrase(phrases[state.phraseIndex]);setSaved(value=>[...value,phrases[state.phraseIndex]])}if(state.phraseIndex===phrases.length-1)setStep('complete');else setPhraseIndex(i=>i+1)}
  if(state.step==='complete'){if(selected===0)finish();else setStep('yes')}
 };
 const selectRef=useRef(choose);selectRef.current=choose;
 useEffect(()=>{register({activate:()=>{setHeld(false)},start:()=>{if(practice)setHeld(true)},abort:()=>{setHeld(false)},lost:(reason)=>{latched.current=null;setHeld(false);setPaused(true);setFeedback(reason)},yes:()=>{if(practice)selectRef.current(0)},no:()=>{if(practice)selectRef.current(1)}});return()=>register(null)},[register,practice]);
 useEffect(()=>{const down=(event:KeyboardEvent)=>{if(event.code==='Escape'){setPaused(true);return}if(event.code!=='Space'||input!=='switch'||!practice||event.repeat||pressed.current)return;event.preventDefault();pressed.current=true;selectRef.current(current.current.index)};const up=(event:KeyboardEvent)=>{if(event.code==='Space')pressed.current=false};const blur=()=>{pressed.current=false;if(practice)setPaused(true)};window.addEventListener('keydown',down);window.addEventListener('keyup',up);window.addEventListener('blur',blur);return()=>{window.removeEventListener('keydown',down);window.removeEventListener('keyup',up);window.removeEventListener('blur',blur)}},[input,practice]);
 const beginInput=(value:'camera'|'switch')=>{
  setLocalInput(value);setInput(value);
  if(value==='camera'){setStep('cameraOn');void camera.start()}else setStep('yes');
 };
 useEffect(()=>{
  if(step!=='welcome')return;
  const down=(event:KeyboardEvent)=>{
   if(event.code==='Escape'){event.preventDefault();beginInput('camera');return}
   if(event.code==='Space'){event.preventDefault();if(introIndex<introduction.length-1)setIntroIndex(i=>i+1);else beginInput('camera')}
  };
  window.addEventListener('keydown',down);
  return()=>window.removeEventListener('keydown',down);
 },[step,introIndex]);
 return <main className={'onboarding-root'+(step==='welcome'?' cinematic':'')}>
  {gazePoint&&(practice||step==='gazeCalibrate')&&input==='camera'&&<div aria-hidden="true" style={{position:'fixed',left:gazePoint.x,top:gazePoint.y,transform:'translate(-50%,-50%)',width:22,height:22,borderRadius:'50%',border:'3px solid #ff3b30',background:'#ff3b3040',boxShadow:'0 0 14px 3px #ff3b3080',pointerEvents:'none',zIndex:9999,transition:'left .08s linear,top .08s linear'}}/>}
  {(practice||step==='gazeCalibrate')&&input==='camera'&&!eyeTracker.ready&&<div style={{position:'fixed',bottom:16,left:'50%',transform:'translateX(-50%)',color:'#e1e1e8',fontSize:13,zIndex:60}}>Eye tracker starting…</div>}
  {(practice||step==='gazeCalibrate')&&input==='camera'&&eyeTracker.error&&<div style={{position:'fixed',bottom:16,left:'50%',transform:'translateX(-50%)',color:'#ff9a8a',fontSize:13,zIndex:60,maxWidth:'80vw',textAlign:'center'}}>Eye tracker: {eyeTracker.error}</div>}
  {step!=='welcome'&&<header className="onboarding-top"><span><Waves size={24}/> CONTINUUM</span><button className="icon-button" aria-label={voiceOn?'Mute assistant voice':'Enable assistant voice'} onClick={()=>{setVoiceOn(v=>!v);if(voiceOn){speechId.current++;window.speechSynthesis?.cancel();setSpeaking(false)}}}>{voiceOn?<Volume2 size={20}/>:<VolumeX size={20}/>}</button></header>}
  <section className={'onboarding-stage '+(step==='cameraOn'||step==='extraCalibrate'||step==='gazeCalibrate'?'calibration-stage':'')}>
   {step!=='welcome'&&<div className={'onboarding-orb '+(speaking?'is-speaking':'')} aria-hidden="true"><i/><i/><i/><span/></div>}
   {step==='welcome'?(revealed&&<h1 className="onboarding-transcript">{prompt}</h1>):<><span className="onboarding-status">{speaking?'CONTINUUM IS SPEAKING':step==='cameraOn'?'TURNING ON CAMERA':step==='extraCalibrate'?'LEARNING YOUR MOVEMENTS':step==='gazeCalibrate'?'CALIBRATING EYE TRACKING':practice?'WAITING FOR YOUR SELECTION':'GUIDED SETUP'}</span>
   <h1 className="onboarding-transcript">{prompt}</h1>
   </>}
   {step==='cameraOn'&&<div className="onboarding-calibration">
    <video ref={camera.attachPreview} className="camera-preview" autoPlay muted playsInline style={{width:'100%',maxHeight:220,objectFit:'cover',transform:'scaleX(-1)',borderRadius:14}}/>
    {camera.status==='error'&&<button className="button primary" onClick={()=>void camera.start()}>Retry camera</button>}
    <button className="button secondary" onClick={()=>beginInput('switch')}>Use switch instead</button>
   </div>}
   {step==='extraCalibrate'&&<div className="onboarding-calibration">
    <video ref={camera.attachPreview} className="camera-preview" autoPlay muted playsInline style={{width:'100%',maxHeight:220,objectFit:'cover',transform:'scaleX(-1)',borderRadius:14}}/>
    <div className="onboarding-progress">Learning {camera.extraIndex+1} of {EXTRA_CANDIDATES.length} — {camera.extraCandidate.label} · round {camera.extraRound+1} of {camera.extraRounds}</div>
    {!camera.tracking&&<p className="onboarding-help">{camera.qualityMessage}</p>}
   </div>}
   {step==='gazeCalibrate'&&<div className="onboarding-calibration">
    <div className="onboarding-progress">Look here — point {gazeIndex+1} of {GAZE_POINTS.length}</div>
    <div aria-hidden="true" style={{position:'fixed',left:`${GAZE_POINTS[gazeIndex][0]}%`,top:`${GAZE_POINTS[gazeIndex][1]}%`,transform:'translate(-50%,-50%)',width:22,height:22,borderRadius:'50%',background:'#e1e1e8',boxShadow:'0 0 22px 6px #e1e1e880',transition:'left .3s ease,top .3s ease'}}/>
   </div>}
   {practice&&<><div className="onboarding-progress">{step==='yes'?'Practice 1 of 2':step==='no'?'Practice 2 of 2':step==='phrases'?`Personal messages · ${phraseIndex+1} of ${phrases.length}`:'Ready to continue'}</div><div className="onboarding-options yes-no-options">{choiceLabels.map((label,i)=><button key={label} data-gaze-id={i} className={index===i&&!paused?'is-highlighted':''} onClick={()=>choose(i)}><span>{label}</span>{index===i&&!paused&&<span className="selection-indicator">{held?'Movement in progress':'SELECT NOW'}<Check size={15}/></span>}</button>)}</div><p className="onboarding-help">{paused?'Selection paused. Use your input once to resume.':input==='camera'?'Look at Yes or No to highlight it, then raise your eyebrows for Yes, or open your mouth for No.':'Press Space when your answer is highlighted. The same movement selects either answer.'}</p><p className="onboarding-feedback" role="status">{feedback}</p>{input==='camera'&&!camera.tracking&&<button className="button secondary" onClick={()=>beginInput('camera')}>Restore camera input</button>}</>}
   {step!=='welcome'&&<button className="text-button repeat-prompt" onClick={()=>narrate(prompt)}><Volume2 size={15}/>Repeat spoken instruction</button>}
  </section>
 </main>
}
