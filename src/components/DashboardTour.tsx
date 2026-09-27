import {forwardRef,useEffect,useImperativeHandle,useState} from 'react';
import {ArrowRight,X} from 'lucide-react';

type StepDef={id:string;selector:string;title:string;text:string;view?:'assistant'|'board'};
const STEPS:StepDef[]=[
 {id:'nav',selector:'[data-tour="nav"]',title:'Getting around',text:'These are the things I can do for you. Select one with your movement or switch to open it.',view:'assistant'},
 {id:'access',selector:'[data-tour="access"]',title:'Your access',text:'This shows whether I am watching for your movement or switch right now, and lets you pause or change how you select things.'},
 {id:'composer',selector:'[data-tour="composer"]',title:'Your message',text:'Whatever you choose to say builds up here. Nothing is spoken until you review and confirm it.',view:'board'},
 {id:'suggestions',selector:'[data-tour="suggestions"]',title:'Suggested words',text:'I suggest phrases and words based on what you have said before, so you have less to select.'},
 {id:'phrases',selector:'[data-tour="phrases"]',title:'Now you try',text:'Choose a message below, then select it again to hear it spoken out loud.'},
];
export type DashboardTourHandle={advance:()=>void;skip:()=>void};

export const DashboardTour=forwardRef<DashboardTourHandle,{active:boolean;onNavigate:(view:'assistant'|'board')=>void;onDone:()=>void}>(function DashboardTour({active,onNavigate,onDone},ref){
 const [index,setIndex]=useState(0);
 const step=STEPS[index];
 const advance=()=>{if(index<STEPS.length-1)setIndex(i=>i+1);else onDone()};
 useImperativeHandle(ref,()=>({advance,skip:onDone}),[index]);
 useEffect(()=>{if(active&&step?.view)onNavigate(step.view)},[active,index]);
 useEffect(()=>{
  if(!active)return;
  const el=document.querySelector(step.selector);
  el?.classList.add('tour-highlight');
  return ()=>{el?.classList.remove('tour-highlight')};
 },[active,index,step]);
 useEffect(()=>{
  if(!active)return;
  const down=(e:KeyboardEvent)=>{
   if(e.code==='Escape'){e.preventDefault();onDone();return}
   if(e.code==='Space'){e.preventDefault();advance()}
  };
  window.addEventListener('keydown',down);
  return ()=>window.removeEventListener('keydown',down);
 },[active,index]);
 if(!active)return null;
 return <div className="tour-overlay" role="dialog" aria-label="Dashboard guide">
  <div className="tour-card">
   <div className="tour-head"><strong>{step.title}</strong><button className="icon-button" aria-label="Skip tour" onClick={onDone}><X size={16}/></button></div>
   <p>{step.text}</p>
   <div className="tour-actions"><span className="tour-progress">{index+1} of {STEPS.length}</span><button className="text-button" onClick={onDone}>Skip tour</button><button className="button primary" onClick={advance}>{index<STEPS.length-1?'Next':'Start'}<ArrowRight size={16}/></button></div>
   <p className="tour-hint">Raise your eyebrows for next · open your mouth to skip</p>
  </div>
 </div>;
});
