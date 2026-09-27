// @vitest-environment jsdom
import {act,cleanup,renderHook} from '@testing-library/react';
import {afterEach,describe,expect,it,vi} from 'vitest';
import {useConversation} from './useConversation';

const reply=(text='Hello. What would you like to discuss?')=>new Response(JSON.stringify({reply:text,choices:['Tell me more','Something else'],model:'test-local',elapsedMs:10}));
afterEach(()=>{cleanup();vi.unstubAllGlobals();vi.useRealTimers()});

describe('local conversation request ownership',()=>{
 it('rejects empty, oversized and unavailable requests without adding history',async()=>{
  const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);
  const {result,rerender}=renderHook(({available})=>useConversation({available}),{initialProps:{available:true}});
  await act(async()=>{await result.current.send('  ');await result.current.send('x'.repeat(501))});
  rerender({available:false});await act(async()=>{await result.current.send('Hello')});
  expect(fetcher).not.toHaveBeenCalled();expect(result.current.messages).toHaveLength(1);
 });

 it('does not accept or read aloud a delayed response after cancel, even if transport ignores abort',async()=>{
  let resolve!:(response:Response)=>void;
  const fetcher=vi.fn(()=>new Promise<Response>(done=>{resolve=done}));vi.stubGlobal('fetch',fetcher);
  const onReply=vi.fn();const {result}=renderHook(()=>useConversation({available:true,onReply}));
  let pending!:Promise<void>;act(()=>{pending=result.current.send('Hello');void result.current.send('Duplicate')});
  expect(fetcher).toHaveBeenCalledTimes(1);expect(result.current.pending).toBe(true);
  act(()=>result.current.cancel());
  await act(async()=>{resolve(reply('A stale reply'));await pending});
  expect(result.current.messages.map(m=>m.content)).not.toContain('A stale reply');
  expect(result.current.messages.at(-1)?.content).toBe('Hello');
  expect(result.current.pending).toBe(false);expect(onReply).not.toHaveBeenCalled();
 });

 it('invalidates a pending reply when conversation access becomes unavailable',async()=>{
  let resolve!:(response:Response)=>void;vi.stubGlobal('fetch',vi.fn(()=>new Promise<Response>(done=>{resolve=done})));
  const onReply=vi.fn();const {result,rerender}=renderHook(({available})=>useConversation({available,onReply}),{initialProps:{available:true}});
  let pending!:Promise<void>;act(()=>{pending=result.current.send('Please reply')});rerender({available:false});
  await act(async()=>{resolve(reply());await pending});
  expect(result.current.messages).toHaveLength(2);expect(onReply).not.toHaveBeenCalled();expect(result.current.pending).toBe(false);
 });

 it('keeps a failed request visible, rejects invalid choices, and allows a later valid reply',async()=>{
  const fetcher=vi.fn().mockResolvedValueOnce(new Response('',{status:503})).mockResolvedValueOnce(new Response(JSON.stringify({reply:'Invalid',choices:['Only one'],model:'test',elapsedMs:0}))).mockResolvedValueOnce(reply('Ready now.'));
  vi.stubGlobal('fetch',fetcher);const onReply=vi.fn();const {result}=renderHook(()=>useConversation({available:true,onReply}));
  await act(async()=>{await result.current.send('Hello')});
  expect(result.current.error).toMatch(/unavailable/);expect(result.current.messages.at(-1)?.content).toBe('Hello');
  await act(async()=>{await result.current.send('Try again')});
  expect(result.current.error).toMatch(/invalid reply/);expect(onReply).not.toHaveBeenCalled();
  await act(async()=>{await result.current.send('One more try')});
  expect(result.current.error).toBeNull();expect(result.current.messages.at(-1)?.content).toBe('Ready now.');
  expect(result.current.choices).toEqual(['Tell me more','Something else']);expect(onReply).toHaveBeenCalledExactlyOnceWith('Ready now.');
 });

 it('bounds visible history to 30 messages and model context to 8 role/content messages',async()=>{
  const fetcher=vi.fn(async()=>reply());vi.stubGlobal('fetch',fetcher);
  const {result}=renderHook(()=>useConversation({available:true}));
  for(let index=0;index<18;index++)await act(async()=>{await result.current.send(`Message ${index}`)});
  expect(result.current.messages).toHaveLength(30);
  const request=JSON.parse(String((fetcher.mock.calls as unknown as Array<[string,RequestInit]>).at(-1)![1].body));
  expect(request.messages).toHaveLength(8);expect(request.messages.at(-1)).toEqual({role:'user',content:'Message 17'});
  expect(Object.keys(request.messages[0]).sort()).toEqual(['content','role']);
 });

 it('ends a stalled request at 30 seconds without inventing an answer',async()=>{
  vi.useFakeTimers();vi.stubGlobal('fetch',vi.fn(()=>new Promise(()=>{})));
  const onReply=vi.fn();const {result}=renderHook(()=>useConversation({available:true,onReply}));
  let pending!:Promise<void>;act(()=>{pending=result.current.send('Are you there?')});
  await act(async()=>{vi.advanceTimersByTime(30000);await pending});
  expect(result.current.pending).toBe(false);expect(result.current.error).toMatch(/too long/);
  expect(result.current.messages).toHaveLength(2);expect(onReply).not.toHaveBeenCalled();
 });
});
