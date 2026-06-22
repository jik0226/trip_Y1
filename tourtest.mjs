import { io } from 'socket.io-client';
const URL = 'http://localhost:3000';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (c, m) => (c ? (pass++, console.log('  ✅', m)) : (fail++, console.log('  ❌', m)));

const NAMES = ['택윤', '인성', '규빈', '희근', '인겸', '현우', '지원', '정운'];
const host = io(URL);
await new Promise((r) => host.on('connect', r));
let R = null;
host.on('room:update', (s) => (R = s));
await host.emitWithAck('becomeHost', null);

// 8명 전원 접속 (소켓 보관)
const socks = {};
for (const n of NAMES) {
  const s = io(URL);
  await new Promise((r) => s.on('connect', r));
  await s.emitWithAck('claim', { name: n });
  socks[n] = s;
}
await wait(200);

const t = () => R.tournament;
host.emit('host:startTournament');
for (let i = 0; i < 20 && !t(); i++) await wait(50);
ok(t() && t().phase === 'playing', '팀전 시작 (playing)');
ok(t().teams.A.leader === '현우' && t().teams.B.leader === '인성', '팀장 현우/인성');
ok(t().teams.A.members.length === 4 && t().teams.B.members.length === 4, '4:4 구성');
ok(R.players.find((p) => p.name === '현우').team === 'A', 'player.team 반영(현우=A)');

// 타임1: A 3점, B 1점 → B 패배 → 고기굽기
host.emit('host:teamScore', { team: 'A', delta: 3 });
host.emit('host:teamScore', { team: 'B', delta: 1 });
await wait(150);
ok(t().teamScore.A === 3 && t().teamScore.B === 1, '팀 점수 합산');
host.emit('host:endTime');
await wait(150);
ok(t().phase === 'swapPrompt', '타임 종료 → 교환 선택 단계');
ok(t().results[0].loser === 'B' && t().results[0].chore.includes('고기'), '진 팀(B) = 고기굽기');

// 교환1: 랜덤
const beforeA = [...t().teams.A.members];
host.emit('host:startSwap', { method: 'random' });
await wait(200);
ok(t().phase === 'playing' && t().timeIndex === 1, '랜덤 교환 후 타임2 진입');
ok(t().teams.A.members.length === 4 && t().teams.B.members.length === 4, '교환 후에도 4:4');
ok(t().teams.A.leader === '현우' && t().teams.B.leader === '인성', '팀장은 교환 안 됨');
ok(t().lastSwap && t().lastSwap.AtoB && t().lastSwap.BtoA, `1:1 교환 발생 (${t().lastSwap.AtoB}↔${t().lastSwap.BtoA})`);
ok(JSON.stringify(beforeA) !== JSON.stringify(t().teams.A.members), 'A팀 명단 변경됨');

// 타임2: B 5점 → A 패배
host.emit('host:teamScore', { team: 'B', delta: 5 });
await wait(120);
host.emit('host:endTime');
await wait(150);
ok(t().results[1].loser === 'A', '타임2 진 팀 A');

// 교환2: 팀장 지정
host.emit('host:startSwap', { method: 'leader' });
await wait(150);
ok(t().phase === 'swap' && t().swap.method === 'leader', '팀장 지정 단계');
const oppB = t().teams.B.members.filter((m) => m !== '인성');
const oppA = t().teams.A.members.filter((m) => m !== '현우');
socks['현우'].emit('leader:pick', { target: oppB[0] }); // A가 B에서 데려옴
await wait(120);
socks['인성'].emit('leader:pick', { target: oppA[0] }); // B가 A에서 데려옴
await wait(200);
ok(t().phase === 'playing' && t().timeIndex === 2, '팀장 지정 교환 → 타임3 진입');
ok(t().teams.A.members.includes(oppB[0]), `지목한 ${oppB[0]} A팀 합류`);

// 타임3 (마지막): 끝나면 done, 교환 없음
host.emit('host:teamScore', { team: 'B', delta: 3 });
await wait(120);
host.emit('host:endTime');
await wait(150);
ok(t().phase === 'done' && t().timeIndex === 2, '타임3 종료 → done (교환 없음)');
ok(t().results.length === 3, '3타임 모두 기록');

// --- 별도 미니런: 다수결 + 동점 거부 ---
host.emit('host:endTournament'); await wait(120);
host.emit('host:startTournament'); await wait(150);
host.emit('host:teamScore', { team: 'A', delta: 2 });
host.emit('host:teamScore', { team: 'B', delta: 2 });
await wait(120);
let errMsg = null; host.once('host:error', (m) => (errMsg = m));
host.emit('host:endTime'); await wait(200);
ok(errMsg && errMsg.includes('동점'), '동점이면 타임 종료 거부');

host.emit('host:teamScore', { team: 'A', delta: 1 }); await wait(100);
host.emit('host:endTime'); await wait(150);
host.emit('host:startSwap', { method: 'vote' }); await wait(150);
ok(t().phase === 'swap' && t().swap.method === 'vote', '다수결 단계 진입');
// A팀 전원 같은 사람에게 투표
const aMembers = t().teams.A.members;
const aTarget = aMembers.find((m) => m !== '현우');
for (const m of aMembers) socks[m].emit('swap:vote', { target: aTarget });
const bMembers = t().teams.B.members;
const bTarget = bMembers.find((m) => m !== '인성');
for (const m of bMembers) socks[m].emit('swap:vote', { target: bTarget });
await wait(300);
ok(t().lastSwap && t().lastSwap.method === 'vote', `다수결 교환 완료 (${t().lastSwap?.AtoB}↔${t().lastSwap?.BtoA})`);
ok(t().teams.B.members.includes(aTarget), `투표로 보낸 ${aTarget} → B팀 이동`);

console.log(`\n결과: ${pass} 통과 / ${fail} 실패`);
host.close(); Object.values(socks).forEach((s) => s.close());
process.exit(fail ? 1 : 0);
