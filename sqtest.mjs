import { io } from 'socket.io-client';
const URL = 'http://localhost:3000';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (c, m) => (c ? (pass++, console.log('  ✅', m)) : (fail++, console.log('  ❌', m)));
const NAMES = ['택윤', '인성', '규빈', '희근', '인겸', '현우', '지원', '정운'];

const socks = {};
for (const n of NAMES) {
  const s = io(URL); await new Promise((r) => s.on('connect', r));
  await s.emitWithAck('claim', { name: n, clientId: 'c-' + n });
  socks[n] = s;
}
const host = socks['인겸'];
let R = null; host.on('room:update', (s) => (R = s));
const sq = () => R?.speedquiz;

host.emit('host:endTournament'); await wait(120);
host.emit('host:startTournament'); await wait(200);
const teamA = R.tournament.teams.A.members, teamB = R.tournament.teams.B.members;

// === 1명 출제자 흐름 (charades) ===
host.emit('host:sq:start', { variantId: 'charades', duration: 2 }); await wait(200);
ok(sq() && sq().phase === 'setup' && sq().presenters === 1, '1명 출제자 변형 시작 (charades)');

const presA = teamA[0];
host.emit('host:sq:setFirst', { team: 'A' });
host.emit('host:sq:setPresenter', { team: 'A', name: presA }); await wait(200);
ok(Array.isArray(sq().presenter.A) && sq().presenter.A[0] === presA, `출제자 배열 ${presA}`);

let gotWord = null; socks[presA].on('sq:word', (p) => { gotWord = p?.word || null; });
host.emit('host:sq:begin'); await wait(300);
ok(typeof gotWord === 'string' && gotWord.length > 0, `1명 출제자 단어 수신: "${gotWord}"`);
ok(!JSON.stringify(sq()).includes(gotWord), '공개 상태에 단어 미포함');
socks[presA].emit('sq:correct'); await wait(120);
socks[presA].emit('sq:correct'); await wait(120);
ok(sq().count.A === 2, `1명 모드: 정답 +2`);
socks[teamA[1]].emit('sq:correct'); await wait(150);
ok(sq().count.A === 2, '1명 모드: 비출제자는 정답 불가');
host.emit('host:sq:endRound'); await wait(200);
ok(sq().done.A && sq().phase === 'between', 'A 라운드 종료');

const presB = teamB[0];
host.emit('host:sq:setPresenter', { team: 'B', name: presB }); await wait(150);
let gotWordB = null; socks[presB].on('sq:word', (p) => { gotWordB = p?.word || null; });
host.emit('host:sq:begin'); await wait(300);
ok(typeof gotWordB === 'string', `B 라운드 출제자(${presB}) 단어 수신`);
socks[presB].emit('sq:correct'); await wait(150);
host.emit('host:sq:endRound'); await wait(200);
ok(sq().winner === 'A' && R.tournament.teamScore.A === 1, '승부 A승 + 승점');
host.emit('host:sq:end'); await wait(150);

// === 2명 출제자 흐름 (silent_scream — 헤드셋 2개, 번갈아) ===
host.emit('host:sq:start', { variantId: 'silent_scream', duration: 20 }); await wait(200);
ok(sq().presenters === 2, '2명 출제자 변형 시작 (silent_scream)');
host.emit('host:sq:setFirst', { team: 'A' });
const [pA1, pA2] = [teamA[0], teamA[1]];
host.emit('host:sq:setPresenter', { team: 'A', name: pA1 }); await wait(80);
host.emit('host:sq:setPresenter', { team: 'A', name: pA2 }); await wait(150);
ok(sq().presenter.A.length === 2 && sq().presenter.A.includes(pA1) && sq().presenter.A.includes(pA2), `출제자 2명 ${pA1}/${pA2}`);

// 한 명 더 누르면 3명 거부
let err = null; host.once('host:error', (m) => (err = m));
host.emit('host:sq:setPresenter', { team: 'A', name: teamA[2] }); await wait(200);
ok(err && err.includes('2명'), `cap 초과 거부: ${err?.slice(0,30)}`);

// 이미 있는 거 다시 누르면 토글 제거
host.emit('host:sq:setPresenter', { team: 'A', name: pA1 }); await wait(150);
ok(sq().presenter.A.length === 1, '토글 제거 동작');
host.emit('host:sq:setPresenter', { team: 'A', name: pA1 }); await wait(120);
ok(sq().presenter.A.length === 2, '다시 추가');

let words = { [pA1]: null, [pA2]: null };
socks[pA1].on('sq:word', (p) => (words[pA1] = p?.word || null));
socks[pA2].on('sq:word', (p) => (words[pA2] = p?.word || null));
host.emit('host:sq:begin'); await wait(400);
const cur1 = sq().presenter.A[sq().curIdx];
const other1 = sq().presenter.A.find(n => n !== cur1);
ok(typeof words[cur1] === 'string' && words[cur1].length > 0, `현재 차례 출제자(${cur1}) 단어 수신`);
ok(words[other1] === null, `다른 출제자(${other1})는 단어 안 받음(대기)`);

// 같은 팀의 비출제자가 정답 누르면 OK + 다음 출제자로 토글
const judge = teamA.find((n) => !sq().presenter.A.includes(n));
socks[judge].emit('sq:correct'); await wait(300);
ok(sq().count.A === 1, '같은 팀 비출제자가 정답 → +1');
ok(sq().curIdx === 1, 'curIdx 토글 (0 → 1)');
ok(words[other1] && other1 !== cur1, `다음 차례(${other1})에게 단어 전달`);

// 다시 누르면 0으로
socks[judge].emit('sq:correct'); await wait(300);
ok(sq().curIdx === 0 && sq().count.A === 2, 'curIdx 다시 0, 점수 누적');

// 다른 팀(B) 사람은 정답 못 누름
const bMember = teamB[0];
socks[bMember].emit('sq:correct'); await wait(200);
ok(sq().count.A === 2, '상대 팀은 정답 누를 수 없음');

host.emit('host:sq:end'); await wait(150);
ok(!sq(), '게임 정리');

console.log(`\n결과: ${pass} 통과 / ${fail} 실패`);
Object.values(socks).forEach((s) => s.close());
process.exit(fail ? 1 : 0);
