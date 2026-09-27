import {useCallback,useEffect,useRef,useState} from 'react';
import {startupDeadline} from './startupDeadline';

export type RecorderStatus='idle'|'requesting'|'recording'|'ready'|'error';
/** Optional local audio clip. No upload, transcription, voice cloning or automatic playback. */
export function useVoiceRecorder(){
 const [status,setStatus]=useState<RecorderStatus>('idle');const statusRef=useRef<RecorderStatus>('idle');
 const [error,setError]=useState('');const [blobUrl,setBlobUrl]=useState<string|null>(null);
 const stream=useRef<MediaStream|null>(null),recorder=useRef<MediaRecorder|null>(null),audio=useRef<HTMLAudioElement|null>(null);
 const url=useRef<string|null>(null),mime=useRef('audio/webm'),generation=useRef(0),timer=useRef<ReturnType<typeof setTimeout>|null>(null);
 const state=(value:RecorderStatus)=>{statusRef.current=value;setStatus(value)};
 const release=useCallback(()=>{
  if(timer.current)clearTimeout(timer.current);timer.current=null;
  if(recorder.current&&recorder.current.state!=='inactive')recorder.current.stop();recorder.current=null;
  stream.current?.getTracks().forEach(track=>track.stop());stream.current=null;
  audio.current?.pause();audio.current=null;
 },[]);
 const clear=useCallback(()=>{
  generation.current++;release();if(url.current)URL.revokeObjectURL(url.current);url.current=null;setBlobUrl(null);setError('');state('idle');
 },[release]);
 const stop=useCallback(()=>{
  if(statusRef.current==='requesting'){clear();return}
  if(statusRef.current==='recording')release();else audio.current?.pause();
 },[clear,release]);
 const start=useCallback(async()=>{
  if(statusRef.current==='requesting'||statusRef.current==='recording')return;
  clear();const token=generation.current;state('requesting');
  try{
   if(!navigator.mediaDevices?.getUserMedia||typeof MediaRecorder==='undefined')throw new Error('Audio recording needs a supported browser on localhost or HTTPS.');
   const acquired=await startupDeadline(navigator.mediaDevices.getUserMedia({audio:true,video:false}),10000,'Microphone permission did not finish. Allow microphone access in Chrome or Edge, then try again.',()=>token!==generation.current,value=>value.getTracks().forEach(track=>track.stop()));
   if(token!==generation.current){acquired.getTracks().forEach(track=>track.stop());return}
   stream.current=acquired;
   const supported=['audio/webm;codecs=opus','audio/webm','audio/mp4'].find(type=>MediaRecorder.isTypeSupported(type));
   const recording=new MediaRecorder(acquired,supported?{mimeType:supported}:undefined);recorder.current=recording;
   const chunks:Blob[]=[];
   recording.ondataavailable=event=>{if(token===generation.current&&event.data.size)chunks.push(event.data)};
   recording.onstop=()=>{
    if(token!==generation.current)return;
    stream.current?.getTracks().forEach(track=>track.stop());stream.current=null;
    if(timer.current)clearTimeout(timer.current);timer.current=null;
    if(!chunks.length){setError('No audio was captured. Check the microphone and try again.');state('error');return}
    mime.current=recording.mimeType||chunks[0].type||'audio/webm';
    const blob=new Blob(chunks,{type:mime.current});url.current=URL.createObjectURL(blob);setBlobUrl(url.current);state('ready');
   };
   recording.onerror=()=>{if(token!==generation.current)return;generation.current++;release();setError('The microphone recording failed. Try again.');state('error')};
   recording.start();state('recording');timer.current=setTimeout(stop,30000);
  }catch(reason){if(token!==generation.current)return;release();setError(reason instanceof Error?reason.message:'The microphone could not start.');state('error')}
 },[clear,release,stop]);
 const play=useCallback(async()=>{
  if(!url.current||statusRef.current!=='ready')return;
  const token=generation.current;audio.current?.pause();const player=new Audio(url.current);audio.current=player;
  try{await player.play()}catch{if(token===generation.current)setError('Audio preview could not start. Try Play again or download the clip.')}
 },[]);
 const download=useCallback(()=>{
  if(!url.current||statusRef.current!=='ready')return;
  const link=document.createElement('a');link.href=url.current;
  link.download=`continuum-voice-${new Date().toISOString().replaceAll(':','-')}.${mime.current.includes('mp4')?'m4a':mime.current.includes('ogg')?'ogg':'webm'}`;
  document.body.appendChild(link);link.click();link.remove();
 },[]);
 useEffect(()=>()=>{generation.current++;release();if(url.current)URL.revokeObjectURL(url.current)},[release]);
 return{status,error,blobUrl,start,stop,play,download,clear};
}
