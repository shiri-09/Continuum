import {useEffect,useRef,useState} from 'react';
import {checkLocalAssistantStatus,requestLocalSuggestions,type LocalAssistantStatus} from './localAssistant';

export type Proposal={id:string;name:string;arguments:Record<string,unknown>;summary:string};
export type TaskReceipt={message?:string;summary?:string;path?:string;[key:string]:unknown};
export function useTaskAssistant(draft:string,revision:number,available:boolean){
 const [status,setStatus]=useState<LocalAssistantStatus|null>(null);
 const [busy,setBusy]=useState<'words'|'plan'|'execute'|null>(null);
 const [candidates,setCandidates]=useState<string[]>([]);
 const [proposal,setProposal]=useState<Proposal|null>(null);
 const [receipt,setReceipt]=useState<TaskReceipt|null>(null);
 const [message,setMessage]=useState('Choose a request to prepare with the local model.');
 const [latency,setLatency]=useState<number|null>(null);
 const [model,setModel]=useState('');
 const controller=useRef<AbortController|null>(null);
 const current=useRef({draft,revision,available});current.current={draft,revision,available};
 const proposed=useRef<Proposal|null>(null);proposed.current=proposal;
 const epoch=useRef(0);const inFlight=useRef(false);const consumed=useRef(new Set<string>());
 const cancelProposal=(value:Proposal|null)=>{if(value)void fetch('/api/cancel',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({proposalId:value.id})}).catch(()=>{});};
 useEffect(()=>{const request=new AbortController();void checkLocalAssistantStatus(request.signal).then(value=>{if(!request.signal.aborted)setStatus(value)});return()=>request.abort()},[]);
 useEffect(()=>{epoch.current++;inFlight.current=false;controller.current?.abort();cancelProposal(proposed.current);setProposal(null);setCandidates([]);setReceipt(null);setBusy(null);setMessage('Review generated wording before selecting it. Actions require confirmation.');},[revision,available]);
 useEffect(()=>()=>{controller.current?.abort();cancelProposal(proposed.current)},[]);
 const refresh=async()=>setStatus(await checkLocalAssistantStatus());
 const cancel=()=>{epoch.current++;inFlight.current=false;controller.current?.abort();cancelProposal(proposal);setProposal(null);setBusy(null);setMessage('Cancelled. No new action was authorized.');};
 const isCurrent=(id:number,rev:number,text:string)=>id===epoch.current&&current.current.available&&rev===current.current.revision&&text===current.current.draft;
 const expand=async()=>{
  if(inFlight.current||busy||!draft.trim()||!available)return;inFlight.current=true;
  const id=++epoch.current;const rev=revision,text=draft;const request=new AbortController();controller.current=request;
  setBusy('words');setCandidates([]);setMessage('Finding ways to phrase your thought…');
  try{const result=await requestLocalSuggestions({shorthand:text,revision:rev},{signal:request.signal,timeoutMs:30000});if(!isCurrent(id,rev,text))return;setCandidates(result.suggestions);setLatency(result.elapsedMs);setModel(result.model);setMessage(result.suggestions.length?'Choose a sentence, then review it before speech.':'The model could not confidently expand this. Your original words are unchanged.');}
  catch(error){if(isCurrent(id,rev,text))setMessage(error instanceof Error?error.message:'The local model is unavailable.');}
  finally{if(id===epoch.current){inFlight.current=false;setBusy(null)}}
 };
 const plan=async()=>{
  if(inFlight.current||busy||!draft.trim()||!available)return;inFlight.current=true;
  const id=++epoch.current;const rev=revision,text=draft;const request=new AbortController();controller.current=request;
  cancelProposal(proposal);setProposal(null);setReceipt(null);setBusy('plan');setMessage('The local model is choosing a supported tool…');
  const timer=setTimeout(()=>request.abort(),45000);
  try{const response=await fetch('/api/plan',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({request:text}),signal:request.signal});const data=await response.json();if(!isCurrent(id,rev,text)){cancelProposal(data.proposal??null);return}if(!response.ok)throw new Error(data.error||'Could not propose an action.');const value=data.proposal;if(!value||typeof value.id!=='string'||!value.id||typeof value.summary!=='string'||!['create_note','open_app','open_website'].includes(value.name)||!value.arguments||typeof value.arguments!=='object'||Array.isArray(value.arguments))throw new Error('The model did not return a supported action.');setProposal(value);setLatency(data.elapsedMs??null);setModel(data.model??'local model');setMessage('Nothing has run. Check the exact action below.');}
  catch(error){if(isCurrent(id,rev,text))setMessage(request.signal.aborted?'The local model took too long. Nothing was executed.':error instanceof Error?error.message:'Could not reach local AI.');}
  finally{clearTimeout(timer);if(id===epoch.current){inFlight.current=false;setBusy(null)}}
 };
 const execute=async()=>{
  if(!proposal||inFlight.current||busy||!available||consumed.current.has(proposal.id))return;inFlight.current=true;consumed.current.add(proposal.id);
  const selected=proposal;const id=++epoch.current;setProposal(null);setBusy('execute');setMessage('Running your confirmed action…');
  try{const response=await fetch('/api/execute',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({proposalId:selected.id}),signal:AbortSignal.timeout(15000)});const data=await response.json();if(id!==epoch.current)return;if(!response.ok)throw new Error(data.error||'The action did not complete.');setReceipt(data.receipt??data);setMessage('Your confirmed action returned a result.');}
  catch(error){if(id===epoch.current)setMessage(error instanceof Error?error.message:'No result was received. Check the computer before retrying.');}
  finally{if(id===epoch.current){inFlight.current=false;setBusy(null)}}
 };
 return{status,busy,candidates,proposal,receipt,message,latency,model,expand,plan,execute,cancel,refresh};
}
