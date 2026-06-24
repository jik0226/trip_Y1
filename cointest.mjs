import { io } from 'socket.io-client';
const URL='http://localhost:3000'; const wait=(ms)=>new Promise(r=>setTimeout(r,ms));
let pass=0,fail=0; const ok=(c,m)=>(c?(pass++,console.log('  ✅',m)):(fail++,console.log('  ❌',m)));
const host=io(URL); await new Promise(r=>host.on('connect',r));
await host.emitWithAck('claim',{name:'인겸',clientId:'c-인겸'});
const p=io(URL); await new Promise(r=>p.on('connect',r)); await p.emitWithAck('claim',{name:'택윤',clientId:'c-택윤'});
let R=null; p.on('room:update',s=>R=s); // 참가자도 동전 결과를 받는지(전원 화면)
host.emit('host:coin:flip',{title:'선공 팀',options:['A팀','B팀']}); await wait(200);
ok(R.coin && R.coin.id===1 && JSON.stringify(R.coin.options)===JSON.stringify(['A팀','B팀']),'동전 던지기 브로드캐스트(참가자 수신)');
ok(R.coin.result===0||R.coin.result===1,`결과 0/1: ${R.coin.result} (${R.coin.options[R.coin.result]})`);
host.emit('host:coin:flip',{}); await wait(150);
ok(R.coin.id===2,'다시 던지면 id 증가(새 애니메이션 트리거)');
// 랜덤성: 20번 던져 양쪽 다 나오는지
const seen=new Set();
for(let i=0;i<20;i++){ host.emit('host:coin:flip',{}); await wait(40); seen.add(R.coin.result); }
ok(seen.has(0)&&seen.has(1),'랜덤성: 20회 중 양쪽 결과 모두 출현');
host.emit('host:coin:clear'); await wait(150);
ok(R.coin===null,'동전 지우기');
// 비진행자는 못 던짐
p.emit('host:coin:flip',{}); await wait(150);
ok(R.coin===null,'비진행자는 동전 못 던짐');
console.log(`\n결과: ${pass} 통과 / ${fail} 실패`);
host.close(); p.close(); process.exit(fail?1:0);
