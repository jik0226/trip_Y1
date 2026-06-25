import { io } from 'socket.io-client';
import { judgeQuiz } from './quiz.js';
const URL = 'http://localhost:3000';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (c, m) => (c ? (pass++, console.log('  ✅', m)) : (fail++, console.log('  ❌', m)));

// 자동 채점 단위 테스트
ok(judgeQuiz('이순신', '이순신'), '정확 일치');
ok(judgeQuiz('이순신 ', '이순신'), '공백 무시');
ok(judgeQuiz('잭', '잭/로즈'), '/로 구분된 후보 중 하나');
ok(judgeQuiz('로즈', '잭/로즈'), '/로 구분된 다른 후보');
ok(judgeQuiz('AKMU', 'AKMU/악동뮤지션'), '대소문자/영문');
ok(judgeQuiz('악동뮤지션', 'AKMU/악동뮤지션'), '한글 후보');
ok(judgeQuiz('5천만', '5천만/50000000'), '복수 후보');
ok(!judgeQuiz('서울', '부산'), '명확한 오답 거부');
ok(!judgeQuiz('', '이순신'), '빈 답 거부');

// 게임 흐름
const NAMES = ['택윤', '인성', '규빈', '희근', '인겸', '현우', '지원', '정운'];
const socks = {};
for (const n of NAMES) {
  const s = io(URL); await new Promise((r) => s.on('connect', r));
  await s.emitWithAck('claim', { name: n, clientId: 'c-' + n });
  socks[n] = s;
}
const host = socks['인겸'];
let R = null; host.on('room:update', (s) => (R = s));
const Q = () => R?.quiz;

host.emit('host:endTournament'); await wait(150); host.emit('host:startTournament'); await wait(250);
host.emit('host:quiz:start', { category: '상식' }); await wait(300);
ok(Q() && Q().question && !Q().revealedAnswer, `퀴즈 시작 + 정답 미공개: "${Q()?.question?.slice(0, 30)}"`);
ok(Object.keys(Q().alive).length === 8 && Object.values(Q().alive).every(Boolean), '전원 살아있음 (8명)');

// 답변자 지정
host.emit('host:quiz:assign', { name: '현우' }); await wait(200);
ok(Q().assignedTo === '현우', '답변자 지정 → 현우');

// 틀린 답 → 자동 오답 → 다음 문제, 안 죽음
socks['현우'].emit('quiz:submit', { answer: '아무답이나' }); await wait(200);
ok(Q().submitted && !Q().submitted.correct, '자동 오답 판정');
host.emit('host:quiz:next'); await wait(200);
ok(Q().alive['현우'] === true && Q().idx === 1, '오답이면 탈락 안 되고 다음 문제');

// forceCorrect 경로 (자동 정답 자체는 단위 테스트로 검증 — 클라엔 정답이 안 보임)
host.emit('host:quiz:assign', { name: '택윤' }); await wait(150);
socks['택윤'].emit('quiz:submit', { answer: '오답' }); await wait(200);
host.emit('host:quiz:next', { forceCorrect: true }); await wait(200);
ok(Q().alive['택윤'] === false && Q().eliminated.includes('택윤'), 'forceCorrect → 택윤 탈락(관전)');

host.emit('host:quiz:assign', { name: '규빈' }); await wait(150);
socks['규빈'].emit('quiz:submit', { answer: '오답' }); await wait(200);
host.emit('host:quiz:next', { forceCorrect: true }); await wait(200);
ok(Q().alive['규빈'] === false, 'forceCorrect → 규빈 탈락');

// 정답 공개
host.emit('host:quiz:assign', { name: '희근' }); await wait(150);
socks['희근'].emit('quiz:submit', { answer: 'whatever' }); await wait(200);
host.emit('host:quiz:reveal'); await wait(200);
ok(typeof Q().revealedAnswer === 'string' && Q().revealedAnswer.length > 0, `정답 공개: "${Q().revealedAnswer.slice(0, 20)}"`);

// 한 팀 다 탈락 — A팀 4명 전부 탈락시키기
host.emit('host:quiz:end'); await wait(150);
host.emit('host:quiz:start', { category: '상식' }); await wait(300);
const aTeam = R.tournament.teams.A.members;
const before = R.tournament.teamScore.A;
for (const n of aTeam) {
  if (Q().winner) break;
  host.emit('host:quiz:assign', { name: n }); await wait(80);
  socks[n].emit('quiz:submit', { answer: 'x' }); await wait(120);
  host.emit('host:quiz:next', { forceCorrect: true }); await wait(180);
}
ok(Q().winner === 'A', `A팀 다 탈락 → A팀 승: ${Q()?.winner}`);
ok(R.tournament.teamScore.A === before + 1, `승팀(A) 승점 +1 (${R.tournament.teamScore.A})`);

host.emit('host:quiz:end'); await wait(150);
ok(!Q(), '게임 종료 정리');

console.log(`\n결과: ${pass} 통과 / ${fail} 실패`);
Object.values(socks).forEach((s) => s.close()); process.exit(fail ? 1 : 0);
