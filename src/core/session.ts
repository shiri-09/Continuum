export type InputSource = 'switch' | 'camera';
export type SessionMode = 'compose' | 'review' | 'recovery';
export type LogEvent = { id: number; time: number; kind: string; detail: string };
export interface Session {
  draft: string; history: string[]; revision: number; mode: SessionMode;
  source: InputSource; scanning: boolean; scanIndex: number; generation: number;
  reviewRevision: number | null; recoverySource: InputSource | null; reason: string;
  spoken: number; selections: number; recoveries: number; corrections: number;
  log: LogEvent[];
}
export const initialSession: Session = {
  draft: '', history: [], revision: 0, mode: 'compose', source: 'switch', scanning: false,
  scanIndex: 0, generation: 0, reviewRevision: null, recoverySource: null, reason: '',
  spoken: 0, selections: 0, recoveries: 0, corrections: 0, log: [],
};
export type Action =
 | {type:'EDIT'; text:string} | {type:'UNDO'} | {type:'REVIEW'} | {type:'BACK'}
 | {type:'START'} | {type:'PAUSE'; reason?:string} | {type:'TICK'; count:number} | {type:'PREV'; count:number} | {type:'GAZE'; index:number}
 | {type:'LOST'; reason:string} | {type:'RECOVER'; source:InputSource}
 | {type:'RESUME'} | {type:'SOURCE'; source:InputSource}
 | {type:'SELECT'; generation:number} | {type:'SPOKEN'; revision:number}
 | {type:'LOG'; kind:string; detail:string} | {type:'RESET_METRICS'};
function logged(s:Session, kind:string, detail:string):Session {
  return {...s, log:[...s.log, {id:(s.log.at(-1)?.id ?? 0)+1, time:Date.now(), kind, detail}].slice(-150)};
}
function transitioned(s:Session):Session { return {...s, generation:s.generation+1, scanIndex:0}; }
export function sessionReducer(s:Session,a:Action):Session {
  if(s.mode==='recovery'&&['EDIT','UNDO','BACK','REVIEW','START','SOURCE'].includes(a.type))return s;
  switch(a.type) {
    case 'EDIT': if(a.text===s.draft) return s; return transitioned({...s,draft:a.text.slice(0,1000),history:[...s.history,s.draft].slice(-50),revision:s.revision+1,mode:'compose',reviewRevision:null});
    case 'UNDO': if(!s.history.length) return s; return logged(transitioned({...s,draft:s.history.at(-1)!,history:s.history.slice(0,-1),revision:s.revision+1,reviewRevision:null,mode:'compose',corrections:s.corrections+1}),'correction','Previous edit restored');
    case 'REVIEW': if(!s.draft.trim() || s.mode==='recovery') return s; return logged(transitioned({...s,mode:'review',reviewRevision:s.revision}),'review','Message ready for confirmation');
    case 'BACK': return transitioned({...s,mode:'compose',reviewRevision:null});
    case 'START': if(s.mode==='recovery') return s; return logged(transitioned({...s,scanning:true,reason:''}),'access','Scanning started');
    case 'PAUSE': return logged(transitioned({...s,scanning:false,mode:s.mode==='recovery'?'recovery':'compose',reviewRevision:null,reason:a.reason??'Paused by you'}),'pause',a.reason??'Paused by you');
    case 'TICK': return s.scanning && a.count>0 ? {...s,scanIndex:(s.scanIndex+1)%a.count}:s;
    case 'PREV': return s.scanning && a.count>0 ? {...s,scanIndex:(s.scanIndex-1+a.count)%a.count}:s;
    case 'GAZE': return s.scanning ? {...s,scanIndex:a.index}:s;
    case 'LOST': return logged(transitioned({...s,scanning:false,mode:'recovery',reviewRevision:null,recoverySource:null,reason:a.reason}),'interruption',a.reason);
    case 'RECOVER': if(s.mode!=='recovery') return logged(transitioned({...s,mode:'recovery',scanning:true,reviewRevision:null,recoverySource:a.source,reason:'Change access method'}),'recovery','Access change requested'); return transitioned({...s,recoverySource:a.source,scanning:true});
    case 'RESUME': if(s.mode!=='recovery'||!s.recoverySource) return s; return logged(transitioned({...s,source:s.recoverySource,mode:'compose',recoverySource:null,reason:'',scanning:true,reviewRevision:null,recoveries:s.recoveries+1}),'recovery','Resumed with draft preserved');
    case 'SOURCE': return logged(transitioned({...s,source:a.source,scanning:false,mode:'compose',reviewRevision:null,reason:''}),'access',`${a.source} selected`);
    case 'SELECT': return a.generation===s.generation ? {...s,selections:s.selections+1}:s;
    case 'SPOKEN': if(s.mode!=='review'||s.reviewRevision!==a.revision||s.revision!==a.revision) return s; return logged(transitioned({...s,mode:'compose',scanning:false,reviewRevision:null,spoken:s.spoken+1}),'speech','Approved message playback started');
    case 'LOG': return logged(s,a.kind,a.detail);
    case 'RESET_METRICS': return {...s,spoken:0,selections:0,recoveries:0,corrections:0,log:[]};
  }
}
export function canSpeak(s:Session,revision:number) {return s.mode==='review' && s.reviewRevision===revision && s.revision===revision && !!s.draft.trim();}
