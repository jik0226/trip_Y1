import { io } from 'socket.io-client';
const URL='http://localhost:3000'; const wait=(ms)=>new Promise(r=>setTimeout(r,ms));
let pass=0,fail=0; const ok=(c,m)=>(c?(pass++,console.log('  ✅',m)):(fail++,console.log('  ❌',m)));
const host=io(URL); await new Promise(r=>host.on('connect',r));
await host.emitWithAck('claim',{name:'인겸',clientId:'c-인겸'});
let R=null; host.on('room:update',s=>R=s); const W=()=>R?.word;
host.emit('host:endTournament'); await wait(120); host.emit('host:startTournament'); await wait(200);
ok((R.wordGames||[]).length>=3,`이어말하기 게임 목록 ${R.wordGames.length}개`);
host.emit('host:word:start',{id:'relay'}); await wait(200);
ok(W()&&W().name==='줄줄이 말해요'&&W().prompt.includes('소재'),`줄줄이 시작 + 주제 표시: ${W()?.prompt}`);
const p1=W().prompt;
let changed=false; for(let i=0;i<8;i++){host.emit('host:word:roll');await wait(60);if(W().prompt!==p1)changed=true;}
ok(changed,'새 주제 → 프롬프트 변경됨');
host.emit('host:word:win',{team:'A'}); await wait(200);
ok(W().lastWin==='A'&&R.tournament.teamScore.A===1,'승팀 A 기록 + 승점');
host.emit('host:word:start',{id:'ending'}); await wait(200);
ok(W().prompt.includes('끝나는'),`~로 끝나는 시작: ${W().prompt}`);
ok(R.flow===null, '뽑기 비활성 상태에선 flow null(정상)');
// flow 레지스트리에 word 포함 확인
host.emit('host:flow:start'); host.emit('host:flow:selector',{team:'A'}); await wait(250);
ok(R.flow.total>=16, `뽑기 레지스트리에 이어말하기 포함(총 ${R.flow.total}개)`);
host.emit('host:flow:end'); host.emit('host:word:end'); await wait(150);
ok(!W(),'게임 종료 정리');
console.log(`\n결과: ${pass} 통과 / ${fail} 실패`);
host.close(); process.exit(fail?1:0);
