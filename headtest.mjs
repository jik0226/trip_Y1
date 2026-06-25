import { io } from 'socket.io-client';
const URL='http://localhost:3000'; const wait=(ms)=>new Promise(r=>setTimeout(r,ms));
let pass=0,fail=0; const ok=(c,m)=>(c?(pass++,console.log('  ✅',m)):(fail++,console.log('  ❌',m)));
const NAMES=['택윤','인성','규빈','희근','인겸','현우','지원','정운']; const socks={}; const secret={};
for(const n of NAMES){const s=io(URL);await new Promise(r=>s.on('connect',r));await s.emitWithAck('claim',{name:n,clientId:'c-'+n});s.on('headband:you',p=>secret[n]=p);socks[n]=s;}
const host=socks['인겸']; let R=null; host.on('room:update',s=>R=s);
host.emit('host:endTournament'); await wait(150); host.emit('host:startTournament'); await wait(200);

// 참가자 4명 선택
const parts=['현우','택윤','희근','정운'];
host.emit('host:headband:start',{participants:parts, sourceId:'silent_scream'}); await wait(400);
ok(R.headband?.participants?.length===4,`양세찬 시작 (참가 ${R.headband?.participants?.length}명)`);
ok(R.headband?.answers===null,'공개 상태엔 정답 비공개');
// 참가자 본인은 자기 단어 못 봄
const me1=secret['현우'];
ok(me1?.isParticipant && !me1.visible['현우'],`참가자(현우)는 자기 단어 안 보임`);
ok(me1.visible['택윤'] && me1.visible['희근'] && me1.visible['정운'],'참가자(현우)는 남들 단어 다 보임');
// 비참가자(인성·규빈 등)는 전부 다 보임
const obs=secret['인성'];
ok(obs && !obs.isParticipant && obs.visible['현우'] && obs.visible['택윤'],'관전자(인성)는 전체 다 보임');
// 멱등 승팀
host.emit('host:headband:win',{team:'A'}); await wait(200);
const aBase=R.tournament.teamScore.A;
host.emit('host:headband:win',{team:'B'}); await wait(200);
ok(R.tournament.teamScore.A===aBase-1 && R.tournament.teamScore.B>=1,`멱등 승팀 정정 (A-1, B+1)`);
// 정답 공개
host.emit('host:headband:reveal'); await wait(200);
ok(R.headband.revealed && R.headband.answers,'정답 공개 → answers 노출');
// 끝
host.emit('host:headband:end'); await wait(150);
ok(!R.headband,'게임 종료 정리');

// flow 레지스트리
host.emit('host:flow:start'); host.emit('host:flow:selector',{team:'A'}); await wait(250);
ok(R.flow.total>=20, `뽑기 레지스트리에 양세찬 포함(총 ${R.flow.total}개)`);
host.emit('host:flow:end'); await wait(150);

console.log(`\n결과: ${pass} 통과 / ${fail} 실패`);
Object.values(socks).forEach(s=>s.close()); process.exit(fail?1:0);
