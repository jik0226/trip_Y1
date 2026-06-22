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

// 팀전 시작(팀 구성) → 점수 초기화
host.emit('host:endTournament'); await wait(120);
host.emit('host:startTournament'); await wait(200);
const teamA = R.tournament.teams.A.members, teamB = R.tournament.teams.B.members;

// 스피드 퀴즈 시작 (타이머 2초)
host.emit('host:sq:start', { variantId: 'silent_scream', duration: 2 }); await wait(200);
ok(sq() && sq().phase === 'setup', '스피드퀴즈 시작 (setup)');

// 선공 A, 출제자 = A팀 첫 멤버
const presA = teamA[0];
host.emit('host:sq:setFirst', { team: 'A' });
host.emit('host:sq:setPresenter', { team: 'A', name: presA }); await wait(200);
ok(sq().firstTeam === 'A' && sq().presenter.A === presA, `선공 A, 출제자 ${presA}`);

// 출제자에게만 단어가 가는지
let gotWord = null; socks[presA].on('sq:word', (p) => { gotWord = p?.word || null; });
host.emit('host:sq:begin'); await wait(300);
ok(sq().phase === 'playing' && sq().currentTeam === 'A', 'A 라운드 시작 (playing)');
ok(typeof gotWord === 'string' && gotWord.length > 0, `출제자가 단어 수신: "${gotWord}"`);
ok(!JSON.stringify(sq()).includes(gotWord), '공개 상태에는 단어 미포함 (비밀 유지)');

// 정답 2, 패스 1
socks[presA].emit('sq:correct'); await wait(120);
socks[presA].emit('sq:correct'); await wait(120);
socks[presA].emit('sq:pass'); await wait(120);
ok(sq().count.A === 2, `정답 2개 반영: ${sq().count.A}`);

// 비출제자는 정답 못 누름
socks[teamA[1]].emit('sq:correct'); await wait(150);
ok(sq().count.A === 2, '비출제자는 정답 불가');

// A 라운드 수동 종료 (finishRound 로직 검증)
host.emit('host:sq:endRound'); await wait(200);
ok(sq().done.A && sq().phase === 'between', 'A 라운드 종료 (between)');

// B팀 라운드
const presB = teamB[0];
host.emit('host:sq:setPresenter', { team: 'B', name: presB }); await wait(150);
let gotWordB = null; socks[presB].on('sq:word', (p) => { gotWordB = p?.word || null; });
host.emit('host:sq:begin'); await wait(300);
ok(sq().currentTeam === 'B' && typeof gotWordB === 'string', `B 라운드 시작, 출제자 ${presB} 단어 수신`);
socks[presB].emit('sq:correct'); await wait(150);
ok(sq().count.B === 1, `B 정답 1개: ${sq().count.B}`);

// B 라운드 종료 → 승부 (A 2 vs B 1 → A승, 승점 +1)
host.emit('host:sq:endRound'); await wait(200);
ok(sq().phase === 'done' && sq().winner === 'A', `승부 확정: 승자 ${sq().winner} (A2:B1)`);
ok(R.tournament.teamScore.A === 1, `이긴 A팀 승점 +1: ${R.tournament.teamScore.A}`);

host.emit('host:sq:end'); await wait(150);
ok(!sq(), '게임 종료 후 정리');

// 타이머 자동 종료 검증 (5초)
host.emit('host:sq:start', { variantId: 'charades', duration: 5 }); await wait(150);
host.emit('host:sq:setFirst', { team: 'A' });
host.emit('host:sq:setPresenter', { team: 'A', name: presA }); await wait(150);
host.emit('host:sq:begin'); await wait(5400);
ok(sq() && sq().done.A, '타이머 자동 종료 작동 (5초 후 라운드 종료)');
host.emit('host:sq:end'); await wait(150);

console.log(`\n결과: ${pass} 통과 / ${fail} 실패`);
Object.values(socks).forEach((s) => s.close());
process.exit(fail ? 1 : 0);
