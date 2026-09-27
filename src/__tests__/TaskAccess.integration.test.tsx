// @vitest-environment jsdom
import {act,cleanup,fireEvent,render,screen} from '@testing-library/react';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import type {CameraInputOptions} from '../input/useCameraInput';
import App from '../App';

vi.mock('../intelligence/voiceEngine',async(importOriginal)=>({...(await importOriginal<object>()),speakHuman:(_text:string,{onError}:{onError?:(e:unknown)=>void}={})=>{onError?.(new Error('Kokoro unavailable in tests'));return{cancel:()=>{}}}}));

const camera=vi.hoisted(()=>({options:null as CameraInputOptions|null}));
vi.mock('../input/useCameraInput',async(importOriginal)=>({
 ...(await importOriginal<object>()),
 useCameraInput:(options:CameraInputOptions)=>{
 camera.options=options;
 return {status:'running',ready:true,tracking:true,gesture:'mouth',calibrationStage:'complete',rawScore:0,
 threshold:0.6,releaseThreshold:0.3,qualityMessage:'Simulated input adapter',error:'',remainingSeconds:0,
 measurements:{validFrames:0,invalidFrames:0,completedGestures:0,abortedGestures:0,lastInferenceMs:0,practiceGestures:3},
 videoRef:{current:null},attachPreview:()=>{},start:vi.fn(),stop:vi.fn(),setGesture:vi.fn(),beginCalibration:vi.fn(),
 captureRest:vi.fn(),captureActive:vi.fn(),captureNuisance:vi.fn(),finishCalibration:vi.fn(),
 profileStage:'idle',profileIndex:0,profileCandidate:{gesture:'mouth',label:'Open your mouth',instruction:'Open your mouth comfortably, then close it.'},
 profileResults:[],startProfiling:vi.fn(),chooseProfiledGesture:vi.fn(),applySavedCalibration:vi.fn(),driftWarning:false};
}}));

const response=(data:unknown)=>new Response(JSON.stringify(data),{status:200,headers:{'Content-Type':'application/json'}});
let plans:Array<(value:Response)=>void>;
let requests:Array<{url:string;body:Record<string,unknown>}>;
beforeEach(()=>{
 vi.useFakeTimers();localStorage.clear();localStorage.setItem('continuum.onboarded','true');plans=[];requests=[];
 Object.defineProperty(window,'speechSynthesis',{configurable:true,value:{cancel:vi.fn(),speak:vi.fn(),getVoices:()=>[],addEventListener:vi.fn(),removeEventListener:vi.fn()}});
 vi.stubGlobal('fetch',vi.fn((url:string,init?:RequestInit)=>{
  requests.push({url,body:init?.body?JSON.parse(String(init.body)):{}});
  if(url==='/api/model-status')return Promise.resolve(response({models:[{name:'qwen3:0.6b'}]}));
  if(url==='/api/plan')return new Promise<Response>(resolve=>plans.push(resolve));
  if(url==='/api/execute')return Promise.resolve(response({receipt:{status:'completed',summary:'The approved note was saved.',details:{path:'test-only/note.txt'}}}));
  if(url==='/api/cancel')return Promise.resolve(response({cancelled:true}));
  throw new Error(`Unexpected test endpoint: ${url}`);
 }));
});
afterEach(()=>{cleanup();vi.useRealTimers();vi.unstubAllGlobals()});
const down=(repeat=false)=>fireEvent.keyDown(window,{key:' ',code:'Space',repeat});
const up=()=>fireEvent.keyUp(window,{key:' ',code:'Space'});
const press=()=>{down();up()};
const calls=(url:string)=>requests.filter(r=>r.url===url);
const draft=()=>screen.getByRole('textbox',{name:'Your message'}) as HTMLTextAreaElement;
function scanTo(button:HTMLElement){
 for(let i=0;i<60&&!button.classList.contains('scan-active');i++)act(()=>{vi.advanceTimersByTime(1600)});
 expect(button.classList.contains('scan-active')).toBe(true);
}
async function enterTasks(){
 render(<App/>);await act(async()=>{});fireEvent.click(screen.getAllByRole('button',{name:'Speak'})[0]);press();
 const entry=screen.getAllByRole('button',{name:'Computer actions'}).find(b=>b.closest('.workspace-tools'))!;
 scanTo(entry);press();
}
async function chooseNoteAndPlan(){
 const starter=screen.getByRole('button',{name:/Create a note/});scanTo(starter);press();
 expect(draft().value).toContain('My next adventure');
 const propose=screen.getByRole('button',{name:'Propose an action'});scanTo(propose);press();
 expect(calls('/api/plan')).toHaveLength(1);
 expect(calls('/api/execute')).toHaveLength(0);
}
async function resolvePlan(id='proposal-one'){
 await act(async()=>{plans.shift()!(response({proposal:{id,name:'create_note',arguments:{title:'My next adventure',content:'I would love to visit the mountains.'},summary:'Save your mountain adventure note'},elapsedMs:12,model:'mock-local-model'}))});
}

describe('computer action access through the rendered scanner (network and camera adapters simulated)',()=>{
 it('lets a switch user choose a starter, request a plan and cancel without executing',async()=>{
  await enterTasks();await chooseNoteAndPlan();await resolvePlan();
  const cancel=screen.getByRole('button',{name:'Cancel action'});scanTo(cancel);press();
  await act(async()=>{});
  expect(screen.queryByRole('button',{name:'Confirm this action'})).toBeNull();
  expect(calls('/api/cancel').some(r=>r.body.proposalId==='proposal-one')).toBe(true);
  expect(calls('/api/execute')).toHaveLength(0);
  expect(draft().value).toContain('My next adventure');
 });

 it('requires a new switch activation after an asynchronous proposal, then executes its exact opaque id once',async()=>{
  await enterTasks();
  scanTo(screen.getByRole('button',{name:/Create a note/}));press();
  scanTo(screen.getByRole('button',{name:'Propose an action'}));down();
  await resolvePlan('fresh-proposal');
  scanTo(screen.getByRole('button',{name:'Confirm this action'}));
  down(true);down(false);
  expect(calls('/api/execute')).toHaveLength(0);
  up();press();await act(async()=>{});
  expect(calls('/api/execute')).toEqual([{url:'/api/execute',body:{proposalId:'fresh-proposal'}}]);
  expect(screen.getByText('Action completed.')).toBeTruthy();
  down(true);up();
  expect(calls('/api/execute')).toHaveLength(1);
 });

 it('does not authorize a returned proposal with a camera gesture begun on a pending-request control',async()=>{
  await enterTasks();await chooseNoteAndPlan();
  fireEvent.click(screen.getByRole('button',{name:'Camera'}));
  fireEvent.click(screen.getByRole('button',{name:'Use my camera signal'}));
  // Changing the access configuration invalidates the pending request.
  act(()=>camera.options?.onActivate());
  act(()=>camera.options?.onGestureStart());
  await resolvePlan('obsolete-proposal');
  act(()=>camera.options?.onActivate());
  expect(screen.queryByRole('button',{name:'Confirm this action'})).toBeNull();
  expect(calls('/api/execute')).toHaveLength(0);
  expect(calls('/api/cancel').some(r=>r.body.proposalId==='obsolete-proposal')).toBe(true);
 });

 it('discards a camera release latched before the proposal appeared and accepts a fresh confirmation gesture',async()=>{
  await enterTasks();
  fireEvent.click(screen.getByRole('button',{name:'Camera'}));
  fireEvent.click(screen.getByRole('button',{name:'Use my camera signal'}));
  act(()=>camera.options?.onActivate()); // Starts scanning; does not choose anything.
  const gesture=()=>{act(()=>camera.options?.onGestureStart());act(()=>camera.options?.onActivate())};
  scanTo(screen.getByRole('button',{name:/Create a note/}));gesture();
  scanTo(screen.getByRole('button',{name:'Propose an action'}));gesture();
  scanTo(screen.getByRole('button',{name:'Cancel request'}));
  act(()=>camera.options?.onGestureStart());
  await resolvePlan('camera-proposal');
  act(()=>camera.options?.onActivate());
  expect(calls('/api/execute')).toHaveLength(0);
  expect(screen.getByRole('button',{name:'Confirm this action'})).toBeTruthy();
  scanTo(screen.getByRole('button',{name:'Confirm this action'}));gesture();
  await act(async()=>{});
  expect(calls('/api/execute')).toEqual([{url:'/api/execute',body:{proposalId:'camera-proposal'}}]);
 });
});
