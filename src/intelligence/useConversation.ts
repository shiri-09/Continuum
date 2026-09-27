import {useCallback,useEffect,useRef,useState} from 'react';

export type ConversationMessage={id:number;role:'user'|'assistant';content:string};
export type ConversationOptions={available:boolean;onReply?:(reply:string)=>void};
export const CONVERSATION_STARTERS=['Tell me something interesting','Help me communicate','What can you do?'];
const GREETING='I’m your AI assistant. Choose a highlighted reply with your movement or switch. You can also spell a reply, speak a message, or ask me to prepare a computer task.';
type Reply={reply:string;choices:string[];model:string;elapsedMs:number};
function parseReply(value:unknown):Reply {
 if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('The assistant returned an invalid reply. Try again.');
 const data=value as Record<string,unknown>;
 if(typeof data.reply!=='string'||!data.reply.trim()||data.reply.length>500||
  !Array.isArray(data.choices)||data.choices.length<2||data.choices.length>4||
  !data.choices.every(choice=>typeof choice==='string'&&!!choice.trim()&&choice.length<=80&&!/[\u0000-\u001f\u007f]/u.test(choice))||
  typeof data.model!=='string'||!data.model.trim()||data.model.length>120||
  typeof data.elapsedMs!=='number'||!Number.isFinite(data.elapsedMs)||data.elapsedMs<0)
  throw new Error('The assistant returned an invalid reply. Your message is unchanged.');
 const choices=(data.choices as string[]).map(choice=>choice.trim());
 if(new Set(choices.map(choice=>choice.toLocaleLowerCase())).size!==choices.length)throw new Error('The assistant returned repeated choices. Try again.');
 return {reply:data.reply.trim(),choices,model:data.model,elapsedMs:data.elapsedMs};
}

/** Conversation only: never dispatches computer tools or user-message speech. */
export function useConversation({available,onReply}:ConversationOptions){
 const [messages,setMessages]=useState<ConversationMessage[]>([{id:0,role:'assistant',content:GREETING}]);
 const [choices,setChoices]=useState<string[]>(CONVERSATION_STARTERS);
 const [pending,setPending]=useState(false);
 const [error,setError]=useState<string|null>(null);
 const [model,setModel]=useState('');
 const [elapsedMs,setElapsedMs]=useState<number|null>(null);
 const current=useRef({available,onReply,messages});current.current={available,onReply,messages};
 const epoch=useRef(0),nextId=useRef(1),inFlight=useRef(false);
 const controller=useRef<AbortController|null>(null);
 const cancel=useCallback(()=>{epoch.current++;inFlight.current=false;controller.current?.abort();controller.current=null;setPending(false)},[]);
 useEffect(()=>{if(!available)cancel()},[available,cancel]);
 useEffect(()=>()=>{epoch.current++;inFlight.current=false;controller.current?.abort()},[]);

 const send=useCallback(async(text:string)=>{
  if(!current.current.available||inFlight.current||typeof text!=='string'||!text.trim()||text.length>500)return;
  const content=text.trim();const id=++epoch.current;inFlight.current=true;
  const request=new AbortController();controller.current=request;
  const history:ConversationMessage[]=[...current.current.messages,{id:nextId.current++,role:'user' as const,content}].slice(-30);
  // Update the ref immediately so a synchronous second call cannot read an old conversation.
  current.current={...current.current,messages:history};setMessages(history);setPending(true);setError(null);
  let timedOut=false;
  const timer=setTimeout(()=>{timedOut=true;request.abort()},30000);
  const isCurrent=()=>id===epoch.current&&current.current.available&&!request.signal.aborted;
  try {
   const aborted=new Promise<never>((_,reject)=>request.signal.addEventListener('abort',()=>reject(new Error('Request cancelled')),{once:true}));
   const response=await Promise.race([fetch('/api/conversation',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({messages:history.slice(-8).map(({role,content:message})=>({role,content:message}))}),signal:request.signal}),aborted]);
   if(!isCurrent())return;
   if(!response.ok)throw new Error('The local assistant is unavailable. Your message is kept; try again when it is ready.');
   const data=await Promise.race([response.json(),aborted]);
   if(!isCurrent())return;
   const result=parseReply(data);
   const updated:ConversationMessage[]=[...history,{id:nextId.current++,role:'assistant' as const,content:result.reply}].slice(-30);
   current.current={...current.current,messages:updated};setMessages(updated);setChoices(result.choices);setModel(result.model);setElapsedMs(result.elapsedMs);
   try{current.current.onReply?.(result.reply)}catch{setError('The reply is ready, but audio could not start.')}
  }catch(reason){
   if(id===epoch.current&&current.current.available)setError(timedOut?'The local assistant took too long. Your message is kept. Try again.':reason instanceof Error?reason.message:'The local assistant could not reply. Your message is kept.');
  }finally{
   clearTimeout(timer);
   if(id===epoch.current){inFlight.current=false;controller.current=null;setPending(false)}
  }
 },[]);
 return{messages,choices,pending,error,model,elapsedMs,send,cancel};
}
