import { io } from 'socket.io-client';
const URL = 'http://localhost:3000';
const log = (...a) => console.log(...a);
let pass = 0, fail = 0;
const ok = (c, m) => (c ? (pass++, log('  ✅', m)) : (fail++, log('  ❌', m)));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// 진행자 폰
const host = io(URL);
await new Promise((r) => host.on('connect', r));
let hostRoom = null;
host.on('room:update', (s) => (hostRoom = s));
await host.emitWithAck('becomeHost', null);
host.emit('host:resetScores'); // 이전 실행에서 쌓인 점수 정리
await wait(150);
ok(hostRoom?.players.length === 8, `명단 8명 노출: ${hostRoom?.players.length}명`);
ok(hostRoom?.players.every((p) => p.score === 0), '점수 전체 초기화 동작');

// 두 명이 이름 선택
const p1 = io(URL), p2 = io(URL);
await Promise.all([new Promise((r) => p1.on('connect', r)), new Promise((r) => p2.on('connect', r))]);
const c1 = await p1.emitWithAck('claim', { name: '인겸' });
const c2 = await p2.emitWithAck('claim', { name: '택윤' });
ok(c1.ok && c2.ok, '이름 선택으로 입장 성공');

await wait(150);
const connected = hostRoom.players.filter((p) => p.connected).length;
ok(connected === 2, `접속중 표시 동기화: ${connected}명`);

// 명단에 없는 이름 거부
const bad = await p1.emitWithAck('claim', { name: '없는사람' });
ok(!bad.ok, '명단에 없는 이름은 거부');

// 게임 시작 → 개인 미션 분배
const you1 = new Promise((r) => p1.once('you:update', r));
const you2 = new Promise((r) => p2.once('you:update', r));
const reveal = new Promise((r) => host.once('host:reveal', r));
host.emit('host:startGame', { gameId: 'silent_scream' });
const [m1, m2, rv] = await Promise.all([you1, you2, reveal]);
ok(m1 && m2, '두 폰 모두 개인 미션 수신');
const secrets = [m1, m2].filter((m) => m.secret);
ok(secrets.length === 1, `단어를 본 사람은 정확히 1명(출제자): ${secrets.length}`);
ok(rv?.answer === secrets[0]?.secret, `진행자만 정답 확인: ${rv?.answer}`);

// 점수 실시간 반영
const scored = new Promise((r) => p1.on('room:update', (s) => {
  if (s.players.find((p) => p.name === '인겸')?.score === 1) r(true);
}));
host.emit('host:addScore', { playerId: '인겸', delta: 1 });
ok(await Promise.race([scored, wait(1500).then(() => false)]), '점수 실시간 반영');

// 진행자 권한 없는 폰은 점수 못 바꿈
p2.emit('host:addScore', { playerId: '택윤', delta: 99 });
await wait(200);
ok(hostRoom.players.find((p) => p.name === '택윤').score === 0, '비진행자는 점수 변경 불가');

log(`\n결과: ${pass} 통과 / ${fail} 실패`);
[host, p1, p2].forEach((s) => s.close());
process.exit(fail ? 1 : 0);
