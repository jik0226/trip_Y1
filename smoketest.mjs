import { io } from 'socket.io-client';
const URL = 'http://localhost:3000';
const log = (...a) => console.log(...a);
let pass = 0, fail = 0;
const ok = (c, m) => (c ? (pass++, log('  ✅', m)) : (fail++, log('  ❌', m)));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const conn = (s) => new Promise((r) => s.on('connect', r));

// 인겸 = 기본 진행자 겸 플레이어
const host = io(URL); await conn(host);
let R = null; host.on('room:update', (s) => (R = s));
const hc = await host.emitWithAck('claim', { name: '인겸', clientId: 'host-1' });
ok(hc.ok, '인겸 입장');
await wait(200);
ok(R?.players.length === 8, `명단 8명 노출: ${R?.players.length}명`);
ok(R?.hostName === '인겸', '인겸 자동 진행자 (#1)');
host.emit('host:resetScores'); await wait(120);
ok(R?.players.every((p) => p.score === 0), '점수 전체 초기화');

// 택윤 입장
const p2 = io(URL); await conn(p2);
const c2 = await p2.emitWithAck('claim', { name: '택윤', clientId: 'p2' });
ok(c2.ok, '택윤 입장');
await wait(150);
ok(R.players.filter((p) => p.connected).length === 2, '접속중 2명 동기화');

// #8 이미 접속중인 이름은 다른 기기에서 차단
const dup = io(URL); await conn(dup);
const dr = await dup.emitWithAck('claim', { name: '택윤', clientId: 'other' });
ok(!dr.ok, '이미 접속중인 이름 차단 (#8)');
dup.close();

// 같은 기기(clientId)의 재접속은 허용 (별도 이름 규빈으로, 게임엔 미참여)
const r1 = io(URL); await conn(r1);
ok((await r1.emitWithAck('claim', { name: '규빈', clientId: 'r' })).ok, '규빈 최초 입장');
const r2 = io(URL); await conn(r2);
ok((await r2.emitWithAck('claim', { name: '규빈', clientId: 'r' })).ok, '같은 clientId 재접속 허용');
r1.close(); r2.close(); await wait(200);

// 비진행자는 진행자가 될 수 없음
ok(!(await p2.emitWithAck('becomeHost', null)).ok, '비(非)인겸은 진행자 불가 (#2)');

// 명단에 없는 이름 거부
ok(!(await p2.emitWithAck('claim', { name: '없는사람', clientId: 'p2' })).ok, '명단에 없는 이름 거부');

// 점수 실시간 반영
const scored = new Promise((r) => p2.on('room:update', (s) => {
  if (s.players.find((p) => p.name === '인겸')?.score === 1) r(true);
}));
host.emit('host:addScore', { playerId: '인겸', delta: 1 });
ok(await Promise.race([scored, wait(1500).then(() => false)]), '점수 실시간 반영');

// 진행자 권한 없는 폰은 점수 못 바꿈
p2.emit('host:addScore', { playerId: '택윤', delta: 99 });
await wait(200);
ok(R.players.find((p) => p.name === '택윤').score === 0, '비진행자는 점수 변경 불가');

log(`\n결과: ${pass} 통과 / ${fail} 실패`);
[host, p2].forEach((s) => s.close());
process.exit(fail ? 1 : 0);
