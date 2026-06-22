import { io } from 'socket.io-client';
const URL = 'http://localhost:3000';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (c, m) => (c ? (pass++, console.log('  ✅', m)) : (fail++, console.log('  ❌', m)));
const NAMES = ['택윤', '인성', '규빈', '희근', '인겸', '현우', '지원', '정운'];

const socks = {}; const secret = {};
for (const n of NAMES) {
  const s = io(URL); await new Promise((r) => s.on('connect', r));
  await s.emitWithAck('claim', { name: n, clientId: 'c-' + n });
  s.on('liar:you', (p) => { secret[n] = p; });
  socks[n] = s;
}
const host = socks['인겸'];
let R = null; host.on('room:update', (s) => (R = s));
const L = () => R?.liar;

// 시나리오 1: 라이어 색출 성공
host.emit('host:liar:start', { category: '음식' }); await wait(300);
ok(L() && L().phase === 'describe', '라이어게임 시작 (describe)');
const liars = NAMES.filter((n) => secret[n]?.isLiar);
ok(liars.length === 1, `라이어 정확히 1명: ${liars[0]}`);
const liar = liars[0];
const kw = secret[NAMES.find((n) => !secret[n].isLiar)].keyword;
ok(NAMES.filter((n) => !secret[n].isLiar).every((n) => secret[n].keyword === kw), `시민들은 같은 제시어 공유: ${kw}`);
ok(secret[liar].keyword === null, '라이어는 제시어 모름');
ok(!JSON.stringify(L()).includes(kw) && L().liar === undefined && L().result === undefined,
  '공개 상태에 제시어·라이어 정체 비공개 (이름은 참가자 목록에 정상 노출)');

host.emit('host:liar:toVote'); await wait(200);
ok(L().phase === 'vote', '투표 단계 전환');
for (const n of NAMES) if (n !== liar) socks[n].emit('liar:vote', { target: liar });
socks[liar].emit('liar:vote', { target: NAMES.find((n) => n !== liar) });
await wait(300);
host.emit('host:liar:reveal'); await wait(200);
ok(L().phase === 'result' && L().result.caught && !L().result.liarWins, `색출 성공 → 시민 승 (라이어 ${L().result.liar})`);
ok(JSON.stringify(L()).includes(kw), '결과 단계에선 제시어 공개');

// 시나리오 2: 색출 실패 → 라이어 승
host.emit('host:liar:end'); await wait(150);
host.emit('host:liar:start', {}); await wait(300);
const liar2 = NAMES.filter((n) => secret[n]?.isLiar)[0];
const innocent = NAMES.find((n) => n !== liar2);
host.emit('host:liar:toVote'); await wait(200);
for (const n of NAMES) socks[n].emit('liar:vote', { target: n === innocent ? liar2 : innocent }); // 거의 다 무고한 사람 지목
await wait(300);
host.emit('host:liar:reveal'); await wait(200);
ok(!L().result.caught && L().result.liarWins, `색출 실패 → 라이어 승 (지목 ${L().result.mostVoted})`);

// 시나리오 3: 잡혔지만 제시어 역전 정답
host.emit('host:liar:end'); await wait(150);
host.emit('host:liar:start', {}); await wait(300);
const liar3 = NAMES.filter((n) => secret[n]?.isLiar)[0];
host.emit('host:liar:toVote'); await wait(200);
for (const n of NAMES) if (n !== liar3) socks[n].emit('liar:vote', { target: liar3 });
socks[liar3].emit('liar:vote', { target: NAMES.find((n) => n !== liar3) });
await wait(300);
host.emit('host:liar:reveal'); await wait(200);
ok(L().result.caught && !L().result.liarWins, '잡힘 (역전 전)');
host.emit('host:liar:guess', { success: true }); await wait(200);
ok(L().result.liarWins && L().result.guessUsed, '제시어 역전 정답 → 라이어 승');

// 비참가자(없음) / 종료
host.emit('host:liar:end'); await wait(150);
ok(!L(), '게임 종료 정리');

console.log(`\n결과: ${pass} 통과 / ${fail} 실패`);
Object.values(socks).forEach((s) => s.close());
process.exit(fail ? 1 : 0);
