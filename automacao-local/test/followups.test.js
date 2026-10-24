import test from 'node:test';
import assert from 'node:assert/strict';
import {holidaysFor,FollowupWorker} from '../src/followups.js';
test('calendário inclui feriados fixos, Paixão de Cristo e datas locais cadastradas',()=>{
 const dates=holidaysFor(2026,['2026-09-04']);assert.ok(dates.includes('2026-11-02'));assert.ok(dates.includes('2026-04-03'));assert.ok(dates.includes('2026-09-04'));
 assert.equal(new Set(dates).size,dates.length);
});
test('retornos sincronizam a conversa antes de reservar e não executam em paralelo',async()=>{
 const order=[];let release;
 const f=new FollowupWorker({flush:async()=>{order.push('flush');await new Promise(r=>{release=r;});},rpc:async(name,args)=>{order.push(name);assert.ok(args.p_holidays.includes('2026-11-02'));return 1;}});
 const first=f.tick(new Date('2026-10-24'));assert.equal(await f.tick(),0);release();assert.equal(await first,1);assert.deepEqual(order,['flush','wa_followups_prepare']);
});
