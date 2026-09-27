// @vitest-environment jsdom
import {act,cleanup,renderHook} from '@testing-library/react';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {useVoiceRecorder} from './useVoiceRecorder';

let stopTrack:ReturnType<typeof vi.fn>,getUserMedia:ReturnType<typeof vi.fn>,play:ReturnType<typeof vi.fn>;
let stream:MediaStream;
class FakeRecorder{
 static isTypeSupported=(value:string)=>value.startsWith('audio/webm');
 state='inactive';mimeType='audio/webm';ondataavailable:((event:{data:Blob})=>void)|null=null;onstop:(()=>void)|null=null;onerror:(()=>void)|null=null;
 start(){this.state='recording'}
 stop(){this.state='inactive';this.ondataavailable?.({data:new Blob(['test audio'],{type:this.mimeType})});this.onstop?.()}
}
beforeEach(()=>{
 vi.useFakeTimers();stopTrack=vi.fn();stream={getTracks:()=>[{stop:stopTrack}]} as unknown as MediaStream;
 getUserMedia=vi.fn().mockResolvedValue(stream);Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:{getUserMedia}});
 vi.stubGlobal('MediaRecorder',FakeRecorder);play=vi.fn().mockResolvedValue(undefined);
 vi.stubGlobal('Audio',class{play=play;pause=vi.fn()});
 Object.defineProperty(URL,'createObjectURL',{configurable:true,value:vi.fn(()=> 'blob:test-recording')});
 Object.defineProperty(URL,'revokeObjectURL',{configurable:true,value:vi.fn()});
});
afterEach(()=>{cleanup();vi.unstubAllGlobals();vi.useRealTimers()});

describe('optional local microphone recording',()=>{
 it('requests the microphone only on start, stops its tracks, and plays only on explicit preview',async()=>{
  const {result}=renderHook(()=>useVoiceRecorder());expect(getUserMedia).not.toHaveBeenCalled();
  await act(async()=>{await result.current.start()});expect(getUserMedia).toHaveBeenCalledExactlyOnceWith({audio:true,video:false});
  expect(result.current.status).toBe('recording');expect(play).not.toHaveBeenCalled();
  act(()=>result.current.stop());expect(result.current.status).toBe('ready');expect(stopTrack).toHaveBeenCalled();expect(play).not.toHaveBeenCalled();
  await act(async()=>{await result.current.play()});expect(play).toHaveBeenCalledTimes(1);
  act(()=>result.current.clear());expect(result.current.blobUrl).toBeNull();expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:test-recording');
 });
 it('automatically ends a recording at 30 seconds and revokes the clip on unmount',async()=>{
  const {result,unmount}=renderHook(()=>useVoiceRecorder());await act(async()=>{await result.current.start()});
  act(()=>vi.advanceTimersByTime(29999));expect(result.current.status).toBe('recording');
  act(()=>vi.advanceTimersByTime(1));expect(result.current.status).toBe('ready');expect(stopTrack).toHaveBeenCalled();
  unmount();expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:test-recording');
 });
 it('times out permission at 10 seconds and closes tracks if permission arrives late',async()=>{
  let resolve!:(value:MediaStream)=>void;getUserMedia.mockImplementation(()=>new Promise<MediaStream>(done=>{resolve=done}));
  const {result}=renderHook(()=>useVoiceRecorder());let pending!:Promise<void>;act(()=>{pending=result.current.start()});
  await act(async()=>{vi.advanceTimersByTime(10000);await pending});expect(result.current.status).toBe('error');
  await act(async()=>{resolve(stream)});expect(stopTrack).toHaveBeenCalledTimes(1);expect(result.current.blobUrl).toBeNull();
 });
 it('cancels a pending permission request and releases a late stream after unmount',async()=>{
  let resolve!:(value:MediaStream)=>void;getUserMedia.mockImplementation(()=>new Promise<MediaStream>(done=>{resolve=done}));
  const {result,unmount}=renderHook(()=>useVoiceRecorder());let pending!:Promise<void>;act(()=>{pending=result.current.start()});
  act(()=>result.current.stop());expect(result.current.status).toBe('idle');unmount();
  await act(async()=>{resolve(stream);await pending});expect(stopTrack).toHaveBeenCalledTimes(1);expect(URL.createObjectURL).not.toHaveBeenCalled();
 });
});
