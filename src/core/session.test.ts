import {describe,it,expect} from 'vitest';
import {initialSession,sessionReducer as reduce,canSpeak} from './session';
describe('communication authorization and recovery',()=>{
  it('requires review of the exact current revision',()=>{
    const draft=reduce(initialSession,{type:'EDIT',text:'I disagree.'});
    expect(canSpeak(draft,draft.revision)).toBe(false);
    const review=reduce(draft,{type:'REVIEW'});
    expect(canSpeak(review,review.revision)).toBe(true);
    const changed=reduce(review,{type:'EDIT',text:'Please explain.'});
    expect(canSpeak(changed,review.revision)).toBe(false);
  });
  it('preserves draft on input loss and invalidates pending speech',()=>{
    let s=reduce(initialSession,{type:'EDIT',text:'Please wait.'});
    s=reduce(s,{type:'REVIEW'});
    const lost=reduce(s,{type:'LOST',reason:'No face'});
    expect(lost.draft).toBe('Please wait.');
    expect(lost.mode).toBe('recovery');
    expect(canSpeak(lost,s.revision)).toBe(false);
    expect(reduce(lost,{type:'SPOKEN',revision:s.revision}).spoken).toBe(0);
  });
  it('backup activation enters recovery before explicit resume',()=>{
    let s=reduce(initialSession,{type:'EDIT',text:'A personal message'});
    s=reduce(s,{type:'LOST',reason:'Camera ended'});
    expect(reduce(s,{type:'RESUME'}).mode).toBe('recovery');
    s=reduce(s,{type:'RECOVER',source:'switch'});
    expect(s.mode).toBe('recovery');
    expect(s.draft).toBe('A personal message');
    s=reduce(s,{type:'RESUME'});
    expect(s.source).toBe('switch');
    expect(s.draft).toBe('A personal message');
    expect(s.recoveries).toBe(1);
  });
  it('stale activation cannot be counted after a transition',()=>{
    const s=reduce(initialSession,{type:'LOST',reason:'Stream ended'});
    expect(reduce(s,{type:'SELECT',generation:0}).selections).toBe(0);
  });
  it('speech cannot replay using old authorization',()=>{
    let s=reduce(initialSession,{type:'EDIT',text:'Thank you'});
    s=reduce(s,{type:'REVIEW'});
    const revision=s.revision;
    s=reduce(s,{type:'SPOKEN',revision});
    expect(s.spoken).toBe(1);
    s=reduce(s,{type:'SPOKEN',revision});
    expect(s.spoken).toBe(1);
  });
  it('undo restores content and invalidates review',()=>{
    let s=reduce(initialSession,{type:'EDIT',text:'First'});
    s=reduce(s,{type:'EDIT',text:'Second'});
    s=reduce(s,{type:'REVIEW'});
    s=reduce(s,{type:'UNDO'});
    expect(s.draft).toBe('First'); expect(s.reviewRevision).toBeNull();
  });
});
