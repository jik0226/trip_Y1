// 퀴즈 — 서바이벌 모드. 진행자가 답변자 지정 → 답변자 입력 → 자동 채점.
// 맞히면 그 사람 탈락(관전 전환), 한 팀 다 탈락하면 그 팀 승(상대 팀 +1 승점).
// 정답은 'reveal' 누를 때까지 진행자에게도 미공개 — 다같이 즐길 수 있게.
import { QUIZ_SETS } from './quizgames.js';
import { addTeamScore, teamOf } from './tournament.js';

const shuffle = (arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
};

// 자동 채점: 공백·괄호·대소문자 무시 + 후보 분리(/, 또는) + 부분 일치.
const norm = (s) => String(s || '').toLowerCase().replace(/\([^)]*\)/g, '').replace(/[\s·.,]/g, '');
const candidates = (a) => String(a || '').split(/[\/,]|또는/).map((s) => s.trim()).filter(Boolean);
export function judgeQuiz(submitted, correct) {
  const sub = norm(submitted);
  if (!sub) return false;
  return candidates(correct).some((c) => {
    const cn = norm(c);
    return cn && (cn === sub || cn.includes(sub) || sub.includes(cn));
  });
}

export function initQuiz() { return { active: false }; }
export const quizCategories = () => Object.keys(QUIZ_SETS);

export function quizPublic(s) {
  if (!s?.active) return null;
  const q = s.questions[s.idx];
  return {
    category: s.category,
    idx: s.idx, total: s.questions.length,
    question: q ? q.q : null,
    alive: s.alive,                       // {이름:true/false}
    eliminated: s.eliminated,             // ['인겸', ...] 탈락 순서
    assignedTo: s.assignedTo,             // 현재 답하는 사람
    submitted: s.submitted,               // {answer, correct, by}  ※ answer는 reveal 시에만 공개
    revealedAnswer: s.revealedAnswer || null,
    revealedSubmission: s.revealedSubmission || null,
    winner: s.winner,                     // 'A'|'B'|null
  };
}

export function registerQuiz(socket, { io, room, broadcast, asHost, endOtherGames }) {
  socket.on('host:quiz:start', ({ category }) => asHost(() => {
    const set = QUIZ_SETS[category];
    if (!set) return io.to(socket.id).emit('host:error', '없는 카테고리예요.');
    endOtherGames?.('quiz');
    // 토너먼트 진행 중이면 양 팀 멤버 전부 자동 참가.
    const alive = {};
    const t = room.tournament;
    if (t.active) {
      [...t.teams.A.members, ...t.teams.B.members].forEach((n) => (alive[n] = true));
    } else {
      // 토너먼트 X면 접속자 전부.
      for (const p of room.players.values()) if (p.connected) alive[p.name] = true;
    }
    room.quiz = {
      active: true, category, questions: shuffle(set), idx: 0,
      alive, eliminated: [], assignedTo: null, submitted: null,
      revealedAnswer: null, revealedSubmission: null, winner: null,
    };
    broadcast();
  }));

  // 진행자가 답변자 지정 — 살아있는 참가자 중 1명만.
  socket.on('host:quiz:assign', ({ name }) => asHost(() => {
    const q = room.quiz;
    if (!q.active || q.winner) return;
    if (!q.alive[name]) return io.to(socket.id).emit('host:error', '살아있는 참가자만 지정 가능해요.');
    q.assignedTo = name;
    q.submitted = null;
    q.revealedAnswer = null; q.revealedSubmission = null;
    broadcast();
  }));

  // 답변자 본인이 답 제출 → 자동 채점.
  socket.on('quiz:submit', ({ answer }) => {
    const q = room.quiz;
    if (!q?.active || q.winner) return;
    if (q.assignedTo !== socket.data.name) return; // 지정된 사람만
    const correct = judgeQuiz(answer, q.questions[q.idx]?.a);
    q.submitted = { answer, correct, by: socket.data.name };
    broadcast();
  });

  // 진행자가 결과 확인 + 다음 문제로 (자동 채점 결과 신뢰).
  // 진행자가 보고 "사실 맞는데 자동이 틀렸다"고 판단하면 forceCorrect=true.
  socket.on('host:quiz:next', ({ forceCorrect } = {}) => asHost(() => {
    const q = room.quiz;
    if (!q?.active || q.winner) return;
    const s = q.submitted;
    const wasCorrect = s ? (s.correct || !!forceCorrect) : false;
    if (wasCorrect && s) {
      // 맞힌 사람 탈락(관전 전환)
      q.alive[s.by] = false;
      q.eliminated.push(s.by);
      // 한 팀이 모두 탈락하면 그 팀 승, 상대 팀 짐 → 상대 팀에 +1 승점은 X (사용자: 진 팀이 항목 담당)
      // 사용자 명세: "마지막 남은 사람이 있는 팀이 지는" → 다 빠진 팀이 승.
      if (room.tournament.active) {
        const t = room.tournament;
        const allDeadA = t.teams.A.members.every((n) => !q.alive[n]);
        const allDeadB = t.teams.B.members.every((n) => !q.alive[n]);
        if (allDeadA) { q.winner = 'A'; addTeamScore(t, 'A', 1); }
        else if (allDeadB) { q.winner = 'B'; addTeamScore(t, 'B', 1); }
      }
    }
    if (!q.winner) {
      q.idx += 1;
      q.assignedTo = null;
      q.submitted = null;
      q.revealedAnswer = null; q.revealedSubmission = null;
      if (q.idx >= q.questions.length) {
        // 문제 다 떨어지면 살아있는 사람이 가장 적은 팀이 이김(역방향: 적게 남을수록 승).
        if (room.tournament.active) {
          const t = room.tournament;
          const aliveA = t.teams.A.members.filter((n) => q.alive[n]).length;
          const aliveB = t.teams.B.members.filter((n) => q.alive[n]).length;
          if (aliveA !== aliveB) {
            q.winner = aliveA < aliveB ? 'A' : 'B';
            addTeamScore(t, q.winner, 1);
          } else {
            q.winner = 'draw';
          }
        }
      }
    }
    broadcast();
  }));

  // 정답 공개(진행자가 누름) — 그제서야 모두에게 정답과 제출답이 보임.
  socket.on('host:quiz:reveal', () => asHost(() => {
    const q = room.quiz;
    if (!q?.active) return;
    q.revealedAnswer = q.questions[q.idx]?.a;
    q.revealedSubmission = q.submitted?.answer || null;
    broadcast();
  }));

  socket.on('host:quiz:end', () => asHost(() => { room.quiz = initQuiz(); broadcast(); }));
}
