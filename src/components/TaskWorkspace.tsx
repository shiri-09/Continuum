import {ArrowRight,Check,CheckCheck,FileText,Globe,Monitor,ShieldCheck,Sparkles,X,Zap} from 'lucide-react';
import type {useTaskAssistant} from '../intelligence/useTaskAssistant';
export const TASK_STARTERS=[
 {id:'note',title:'Create a note',description:'Create a note on this computer',text:'Create a note titled My next adventure with the text I would love to visit the mountains.',icon:FileText},
 {id:'calculator',title:'Open calculator',description:'Launch Windows Calculator',text:'Open calculator.',icon:Monitor},
 {id:'explore',title:'Open Wikipedia',description:'Open a Wikipedia article',text:'Open https://en.wikipedia.org/wiki/Moon',icon:Globe},
];
type Props={assistant:ReturnType<typeof useTaskAssistant>;scan:(id:string)=>string;choose:(text:string)=>void;canRequest:boolean};
export function TaskWorkspace({assistant:a,scan,choose,canRequest}:Props){
 return <section className="task-workspace" aria-label="Computer actions">
  <div className="task-intro"><span className="task-symbol"><Monitor size={25}/></span><div><div className="eyebrow">LOCAL AI TOOL USE</div><h2>Choose a computer task</h2><p>Choose a task with your input. The local AI prepares it; you review and confirm.</p></div></div>
  <div className="task-starters">{TASK_STARTERS.map(t=><button key={t.id} className={'task-starter'+scan(`task-${t.id}`)} disabled={!!a.busy} onClick={()=>choose(t.text)}><t.icon size={22}/><strong>{t.title}</strong><span>{t.description}</span><ArrowRight size={16}/></button>)}</div>
  <div className="task-workbench">
   <div className="task-workbench-title"><span><Sparkles size={18}/>Your local assistant</span><span className={'status-pill '+(a.status?.modelInstalled?'live':'')}><span className="status-dot"/>{a.status?.modelInstalled?'Model ready':'Model unavailable'}</span></div>
   <div className="task-steps"><span className="complete">01 · Your request</span><i/><span className={a.proposal?'current':''}>02 · Review action</span><i/><span className={a.receipt?'complete':''}>03 · Your confirmation</span></div>
   {!a.proposal&&!a.receipt&&<div className="task-empty"><Zap size={30}/><h3>Prepare the selected task</h3><p>Select a task above, then select Propose an action. For a custom request, use Spell a message.</p><button className={'button primary'+scan('task-plan')} disabled={!canRequest||!!a.busy} onClick={a.plan}><Sparkles size={17}/>{a.busy==='plan'?'Thinking locally…':'Propose an action'}<ArrowRight size={16}/></button></div>}
   {a.proposal&&<div className="action-proposal"><div className="proposal-heading"><ShieldCheck size={19}/><strong>Review before anything runs</strong></div><h3>{a.proposal.summary||a.proposal.name.replaceAll('_',' ')}</h3><dl>{Object.entries(a.proposal.arguments).map(([key,value])=><div key={key}><dt>{key}</dt><dd>{String(value)}</dd></div>)}</dl><div className="review-actions"><button className={'button secondary'+scan('task-cancel')} onClick={a.cancel}><X size={16}/>Cancel action</button><button className={'button primary'+scan('task-confirm')} onClick={a.execute}><Check size={17}/>Confirm this action</button></div>{a.proposal.name==='open_website'&&<p className="hint">Opening this address connects to that site. Any search words in its URL are sent to the site.</p>}{a.proposal.name==='open_app'&&<p className="hint">This opens a separate Windows app. Continuum does not yet control its interface or provide a global return shortcut.</p>}</div>}
   {a.receipt&&<div className="task-receipt"><span><CheckCheck size={28}/></span><h3>{a.receipt.status==='launch_requested'?'Launch requested.':'Action completed.'}</h3><p>{String(a.receipt.message??a.receipt.summary??'Your confirmed tool returned successfully.')}</p>{!!a.receipt.details&&typeof a.receipt.details==='object'&&'path' in a.receipt.details&&<code>{String(a.receipt.details.path)}</code>}<button className={'button secondary'+scan('task-again')} onClick={()=>choose('')}>Another task<ArrowRight size={16}/></button></div>}
   <div className="task-status" role="status"><span className={a.busy?'thinking-dot':''}/>{a.message}{a.latency!==null&&<small>{(a.latency/1000).toFixed(2)}s · {a.model}</small>}</div>
   {!!a.busy&&a.busy!=='execute'&&<button className={'text-button'+scan('task-stop')} onClick={a.cancel}>Cancel request</button>}
   <div className="task-foot"><ShieldCheck size={14}/>Only listed tools. Every action needs your confirmation.<button className={'text-button'+scan('task-refresh')} onClick={a.refresh}>Check model</button></div>
  </div>
 </section>
}

