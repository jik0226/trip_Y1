import { io } from 'socket.io-client';
const URL='http://localhost:3000'; const wait=(ms)=>new Promise(r=>setTimeout(r,ms));
let pass=0,fail=0; const ok=(c,m)=>(c?(pass++,console.log('  ✅',m)):(fail++,console.log('  ❌',m)));
const NAMES=['택윤','인성','규빈','희근','인겸','현우','지원','정운']; const socks={};
for(const n of NAMES){const s=io(URL);await new Promise(r=>s.on('connect',r));await s.emitWithAck('claim',{name:n,clientId:'c-'+n});socks[n]=s;}
const host=socks['인겸']; let R=null; host.on('room:update',s=>R=s);
const F=()=>R?.flow;
host.emit('host:endTournament'); await wait(120); host.emit('host:startTournament'); await wait(200);
const Aleader=R.tournament.teams.A.leader, Bleader=R.tournament.teams.B.leader;

host.emit('host:flow:start'); await wait(200);
ok(F() && F().total>=10, `뽑기 시작 (게임 ${F()?.total}개)`);
host.emit('host:flow:selector',{team:'A'}); await wait(200);
ok(F().selector==='A' && Array.isArray(F().menu), '선택권 A + 키워드 메뉴 생성');
ok(F().menu.every(k=>typeof k==='string') && !F().menu.includes('고요 속의 외침') && !F().menu.includes('라이어게임'),'공개 메뉴엔 키워드만(게임 정체 숨김)');
const kw0=F().menu[0];
// 비선택팀 팀장(B) 못 고름
socks[Bleader].emit('flow:pick',{keyword:F().menu[1]}); await wait(150);
ok(F().selector==='A' && F().lastPick===null, '비선택팀 팀장은 못 고름');
// 일반 팀원(A, 비팀장) 못 고름
const Amember=R.tournament.teams.A.members.find(n=>n!==Aleader);
socks[Amember].emit('flow:pick',{keyword:kw0}); await wait(150);
ok(F().lastPick===null, '일반 팀원은 못 고름');
// A 팀장이 고름
socks[Aleader].emit('flow:pick',{keyword:kw0}); await wait(200);
ok(F().lastPick && F().lastPick.keyword===kw0 && typeof F().lastPick.name==='string', `A팀장 선택 → 공개: ${kw0} → ${F().lastPick?.name}`);
ok(F().playedCount===1 && F().selector===null && F().menu===null, '선택 후 played+1, 메뉴 닫힘');
// 동전으로 다음 선택팀
const coinBefore=R.coin?.id||0;
host.emit('host:flow:coinSelector'); await wait(250);
ok((R.coin?.id||0)>coinBefore && (F().selector==='A'||F().selector==='B'), '동전 추첨 → 선택팀 자동 배정');
ok(F().menu.length===F().total-1, `메뉴에서 이미 한 게임 제외(${F().menu.length}/${F().total})`);
const sel2=F().selector, leader2=R.tournament.teams[sel2].leader, kw2=F().menu[0];
socks[leader2].emit('flow:pick',{keyword:kw2}); await wait(200);
ok(F().playedCount===2, `두 번째 선택 → played 2 (${F().lastPick?.name})`);
host.emit('host:flow:end'); await wait(150);
ok(!F(),'뽑기 종료 정리');
console.log(`\n결과: ${pass} 통과 / ${fail} 실패`);
Object.values(socks).forEach(s=>s.close()); process.exit(fail?1:0);
