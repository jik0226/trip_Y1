// 퀴즈 — 문제는 전원 화면, 정답은 진행자에게만(quiz:answer). 진행자가 팀별 정답 판정.
// 한 세트(여러 문제) 후 더 많이 맞힌 팀이 승 → 토너먼트 승점 +1 (스피드퀴즈와 동일).
import { QUIZ_SETS } from './quizgames.js';
import { addTeamScore } from './tournament.js';

const shuffle = (arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
};

export function initQuiz() { return { active: false }; }
export const quizCategories = () => Object.keys(QUIZ_SETS);

export function quizPublic(s) {
  if (!s?.active) return null;
  const q = s.questions[s.idx];
  return {
    category: s.category, idx: s.idx, total: s.questions.length,
    question: q ? q.q : null,
    answer: s.revealed && q ? q.a : null, // 공개했을 때만 정답 노출
    revealed: s.revealed, score: s.score, winner: s.winner,
  };
}

export function registerQuiz(socket, { io, room, broadcast, asHost, endOtherGames }) {
  const sendAnswer = () => { // 현재 정답을 진행자에게만 비공개 전송
    const s = room.quiz;
    if (!s.active || room.hostId == null) return;
    const q = s.questions[s.idx];
    io.to(room.hostId).emit('quiz:answer', q ? { answer: q.a, idx: s.idx } : null);
  };

  socket.on('host:quiz:start', ({ category }) => asHost(() => {
    const set = QUIZ_SETS[category];
    if (!set) return io.to(socket.id).emit('host:error', '없는 카테고리예요.');
    endOtherGames?.('quiz');
    room.quiz = { active: true, category, questions: shuffle(set), idx: 0, score: { A: 0, B: 0 }, revealed: false, winner: null };
    broadcast(); sendAnswer();
  }));
  socket.on('host:quiz:reveal', () => asHost(() => { if (room.quiz.active) { room.quiz.revealed = true; broadcast(); } }));
  socket.on('host:quiz:award', ({ team }) => asHost(() => {
    const s = room.quiz;
    if (!s.active || s.idx >= s.questions.length) return;
    if (team === 'A' || team === 'B') s.score[team] += 1;
    s.idx += 1; s.revealed = false;
    broadcast(); sendAnswer();
  }));
  socket.on('host:quiz:skip', () => asHost(() => {
    const s = room.quiz;
    if (!s.active || s.idx >= s.questions.length) return;
    s.idx += 1; s.revealed = false; broadcast(); sendAnswer();
  }));
  socket.on('host:quiz:finish', () => asHost(() => {
    const s = room.quiz;
    if (!s.active || s.winner) return;
    s.winner = s.score.A === s.score.B ? 'draw' : (s.score.A > s.score.B ? 'A' : 'B');
    if (s.winner !== 'draw' && room.tournament.active) addTeamScore(room.tournament, s.winner, 1);
    broadcast();
  }));
  socket.on('host:quiz:end', () => asHost(() => { room.quiz = initQuiz(); broadcast(); }));
}
