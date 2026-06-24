import { io } from 'socket.io-client';
const URL='http://localhost:3000'; const wait=(ms)=>new Promise(r=>setTimeout(r,ms));
let pass=0,fail=0; const ok=(c,m)=>(c?(pass++,console.log('  ✅',m)):(fail++,console.log('  ❌',m)));
const NAMES=['택윤','인성','규빈','희근','인겸','현우','지원','정운']; const socks={};
for(const n of NAMES){const s=io(URL);await new Promise(r=>s.on('connect',r));await s.emitWithAck('claim',{name:n,clientId:'c-'+n});socks[n]=s;}
const host=socks['인겸']; let R=null; host.on('room:update',s=>R=s);
host.emit('host:endTournament'); await wait(150); host.emit('host:startTournament'); await wait(250);

// #1 자동 교체: 룰카드 → 라이어 시작하면 룰카드 자동 종료
host.emit('host:simple:start',{id:'g369'}); await wait(200);
ok(R.simple && !R.liar, '룰카드 시작 (라이어 없음)');
host.emit('host:liar:start',{}); await wait(300);
ok(R.liar && !R.simple, '#1 라이어 시작 → 룰카드 자동 종료');
host.emit('host:liar:end'); await wait(200);

// #2 멱등 승팀: 잘못 누르면 정정
host.emit('host:simple:start',{id:'g369'}); await wait(200);
const beforeA=R.tournament.teamScore.A, beforeB=R.tournament.teamScore.B;
host.emit('host:simple:win',{team:'A'}); await wait(200);
ok(R.tournament.teamScore.A===beforeA+1,`A 승팀 +1 (${R.tournament.teamScore.A})`);
host.emit('host:simple:win',{team:'B'}); await wait(200);
ok(R.tournament.teamScore.A===beforeA && R.tournament.teamScore.B===beforeB+1, `#2 정정: A 원복, B만 +1 (A:${R.tournament.teamScore.A}, B:${R.tournament.teamScore.B})`);
host.emit('host:simple:end'); await wait(150);

// word.js도 동일 멱등 검증
host.emit('host:word:start',{id:'relay'}); await wait(200);
const wbA=R.tournament.teamScore.A, wbB=R.tournament.teamScore.B;
host.emit('host:word:win',{team:'A'}); await wait(150);
host.emit('host:word:win',{team:'B'}); await wait(200);
ok(R.tournament.teamScore.A===wbA && R.tournament.teamScore.B===wbB+1, '#2(word) 정정 작동');
host.emit('host:word:end'); await wait(150);

// #3 팀장 강제 마감: 누락된 픽 랜덤 채움 → 4:4 유지
host.emit('host:teamScore',{team:'A',delta:5}); await wait(150);
host.emit('host:endTime'); await wait(200);
host.emit('host:startSwap',{method:'leader'}); await wait(200);
host.emit('host:forceSwap'); await wait(300); // 둘 다 안 골랐는데 강제
ok(R.tournament.teams.A.members.length===4 && R.tournament.teams.B.members.length===4, `#3 강제 마감 후 4:4 유지`);
ok(R.tournament.lastSwap && R.tournament.lastSwap.AtoB && R.tournament.lastSwap.BtoA, `#3 누락 픽 랜덤 채움 (${R.tournament.lastSwap.AtoB}↔${R.tournament.lastSwap.BtoA})`);

// #4 라이어 미완료 reveal 막힘
host.emit('host:endTournament'); await wait(150);
host.emit('host:liar:start',{}); await wait(300);
host.emit('host:liar:toVote'); await wait(200);
// 2명만 투표
socks['택윤'].emit('liar:vote',{target:'인성'}); socks['인성'].emit('liar:vote',{target:'택윤'}); await wait(200);
let err=null; host.once('host:error',m=>err=m);
host.emit('host:liar:reveal',{}); await wait(300);
ok(err && err.includes('투표'), `#4 미완료 reveal 거부: ${err?.slice(0,40)}`);
host.emit('host:liar:reveal',{force:true}); await wait(300);
ok(R.liar?.phase==='result', '#4 force=true는 통과');
host.emit('host:liar:end'); await wait(150);

console.log(`\n결과: ${pass} 통과 / ${fail} 실패`);
Object.values(socks).forEach(s=>s.close()); process.exit(fail?1:0);
