// @vitest-environment jsdom
import {act,cleanup,fireEvent,render,screen} from '@testing-library/react';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {Onboarding,type SetupSignals} from '../components/Onboarding';
import type {CameraInput} from '../input/useCameraInput';

vi.mock('../intelligence/voiceEngine',()=>({speakHuman:(_text:string,{onError}:{onError?:(e:unknown)=>void}={})=>{onError?.(new Error('Kokoro unavailable in tests'));return{cancel:()=>{}}}}));

beforeEach(()=>{vi.useFakeTimers();Object.defineProperty(window,'speechSynthesis',{configurable:true,value:{getVoices:()=>[],cancel:vi.fn(),addEventListener:vi.fn(),removeEventListener:vi.fn()}})});
afterEach(()=>{cleanup();vi.useRealTimers()});
const down=(repeat=false)=>fireEvent.keyDown(window,{code:'Space',key:' ',repeat});
const up=()=>fireEvent.keyUp(window,{code:'Space',key:' '});
const press=()=>{down();up()};
const reveal=()=>act(()=>vi.advanceTimersByTime(1000));
function setup(){
 const savePhrase=vi.fn(),finish=vi.fn(),setInput=vi.fn();
 const signals:{current:SetupSignals|null}={current:null};
 const camera={ready:true,tracking:true,gesture:'mouth',start:vi.fn()} as unknown as CameraInput;
 render(<Onboarding camera={camera} register={value=>{signals.current=value}} setInput={setInput} savePhrase={savePhrase} finish={finish}/>);
 reveal();
 fireEvent.keyDown(window,{code:'Escape',key:'Escape'});
 fireEvent.click(screen.getByRole('button',{name:'Use switch instead'}));
 return{savePhrase,finish,setInput,signals};
}
function reachPhrases(){press();act(()=>vi.advanceTimersByTime(1900));press();expect(screen.getByText('Personal messages · 1 of 4')).toBeTruthy()}

describe('guided setup input and explicit personal-message choices',()=>{
 it('presents the introduction automatically, advances with Space, and skips with Escape',()=>{
  const setInput=vi.fn(),savePhrase=vi.fn(),finish=vi.fn();
  render(<Onboarding camera={{ready:false,tracking:false,start:vi.fn()} as unknown as CameraInput} register={()=>{}} setInput={setInput} savePhrase={savePhrase} finish={finish}/>);
  expect(screen.queryByRole('heading',{name:'Hi.'})).toBeNull();
  reveal();
  expect(screen.getByRole('heading',{name:'Hi.'})).toBeTruthy();
  act(()=>vi.advanceTimersByTime(8500));
  expect(screen.getByRole('heading',{name:'I’m Continuum.'})).toBeTruthy();
  fireEvent.keyDown(window,{code:'Space',key:' '});
  expect(screen.getByRole('heading',{name:/expensive and hard to find/})).toBeTruthy();
  fireEvent.keyDown(window,{code:'Escape',key:'Escape'});
  expect(screen.getByRole('button',{name:'Use switch instead'})).toBeTruthy();
  expect(setInput).toHaveBeenCalledWith('camera');expect(savePhrase).not.toHaveBeenCalled();expect(finish).not.toHaveBeenCalled();
 });
 it('does not treat time passing without a signal as an answer',()=>{
  const {savePhrase,finish}=setup();
  for(let i=0;i<8;i++)act(()=>vi.advanceTimersByTime(1900));
  expect(screen.getByText('Practice 1 of 2')).toBeTruthy();expect(savePhrase).not.toHaveBeenCalled();expect(finish).not.toHaveBeenCalled();
 });
 it('requires release and a new switch press to advance from Yes practice to No practice',()=>{
  const {savePhrase}=setup();down();expect(screen.getByText('Practice 2 of 2')).toBeTruthy();
  act(()=>vi.advanceTimersByTime(1900));down(true);down(false);
  expect(screen.getByText('Practice 2 of 2')).toBeTruthy();expect(savePhrase).not.toHaveBeenCalled();
  up();press();expect(screen.getByText('Personal messages · 1 of 4')).toBeTruthy();
 });
 it('saves only phrases explicitly selected with Yes and requires a new press for the next phrase',()=>{
  const {savePhrase,finish}=setup();reachPhrases();
  act(()=>vi.advanceTimersByTime(1900));press(); // Explicit No skips first phrase.
  expect(savePhrase).not.toHaveBeenCalled();expect(screen.getByText('Personal messages · 2 of 4')).toBeTruthy();
  down();expect(savePhrase).toHaveBeenCalledExactlyOnceWith('Please ask me directly.');
  down(true);down(false);expect(savePhrase).toHaveBeenCalledTimes(1);
  up();act(()=>vi.advanceTimersByTime(1900));press(); // No to third.
  act(()=>vi.advanceTimersByTime(1900));press(); // No to fourth.
  expect(screen.getByText('Ready to continue')).toBeTruthy();expect(finish).not.toHaveBeenCalled();
  press();expect(finish).toHaveBeenCalledTimes(1);
 });
 it('discards an interrupted camera gesture and requires a fresh direct answer to resume',()=>{
  const {signals,savePhrase}=setup();
  act(()=>signals.current?.lost('Camera interrupted'));
  act(()=>signals.current?.yes());
  expect(screen.getByText('Practice 1 of 2')).toBeTruthy();
  act(()=>signals.current?.yes());
  expect(screen.getByText('Practice 2 of 2')).toBeTruthy();expect(savePhrase).not.toHaveBeenCalled();
 });
});
