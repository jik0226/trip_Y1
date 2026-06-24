import { io } from 'socket.io-client';
const URL='http://localhost:3000'; const wait=(ms)=>new Promise(r=>setTimeout(r,ms));
let pass=0,fail=0; const ok=(c,m)=>(c?(pass++,console.log('  ✅',m)):(fail++,console.log('  ❌',m)));
const NAMES=['택윤','인성','규빈','희근','인겸','현우','지원','정운']; const socks={};
for(const n of NAMES){const s=io(URL);await new Promise(r=>s.on('connect',r));await s.emitWithAck('claim',{name:n,clientId:'c-'+n});socks[n]=s;}
const host=socks['인겸']; let R=null; host.on('room:update',s=>R=s); const S=()=>R?.simple;
host.emit('host:endTournament'); await wait(120); host.emit('host:startTournament'); await wait(200);
ok((R.simpleGames||[]).length>=5,`룰 카드 게임 목록 노출: ${R.simpleGames.length}개`);
host.emit('host:simple:start',{id:'g369'}); await wait(200);
ok(S()&&S().name==='369 게임'&&S().rule.includes('박수'),'룰 카드 시작 + 규칙 표시');
host.emit('host:simple:win',{team:'A'}); await wait(200);
ok(S().lastWin==='A','승팀 A 기록');
ok(R.tournament.teamScore.A===1,`이긴 A팀 승점 +1: ${R.tournament.teamScore.A}`);
host.emit('host:simple:win',{team:'B'}); await wait(200);
ok(R.tournament.teamScore.B===1,'다시 누르면 B팀에도 +1 (정정 가능)');
host.emit('host:simple:end'); await wait(150);
ok(!S(),'게임 종료 정리');
console.log(`\n결과: ${pass} 통과 / ${fail} 실패`);
Object.values(socks).forEach(s=>s.close()); process.exit(fail?1:0);
