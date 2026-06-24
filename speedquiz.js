// 출제자 스피드 퀴즈 상태 기계 (순수 함수). 타이머 자체는 server.js가 setTimeout으로 관리.
// 흐름: setup → (선공팀 출제자 지정 → beginRound → 정답/패스 → 시간종료) → between → 같은 방식 후공팀 → done(승부)
import { SPEED_GAMES } from './speedgames.js';
import { addTeamScore, teamOf } from './tournament.js';

const shuffle = (arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

export function initSpeedQuiz() { return { active: false }; }

export function startSpeedQuiz(variantId, opts = {}) {
  const v = SPEED_GAMES[variantId];
  if (!v) return null;
  return {
    active: true,
    variant: { id: v.id, name: v.name, emoji: v.emoji, keyword: v.keyword, conveyance: v.conveyance },
    words: shuffle(v.words),
    idx: 0,
    phase: 'setup',                 // setup | playing | between | done
    firstTeam: null,
    currentTeam: null,
    presenter: { A: null, B: null },
    count: { A: 0, B: 0 },
    done: { A: false, B: false },
    duration: Math.min(180, Math.max(5, Number(opts.duration) || 60)),
    roundEndsAt: null,
    winner: null,
  };
}

export const sqWord = (s) => (s?.active ? s.words[s.idx % s.words.length] : null);

export function sqSetFirst(s, team) {
  if (!s.active || s.phase !== 'setup') return { error: '시작 전에만 선공을 정할 수 있어요.' };
  if (team !== 'A' && team !== 'B') return { error: '팀 오류.' };
  s.firstTeam = team;
  return { ok: true };
}

export function sqSetPresenter(s, team, name) {
  if (!s.active) return { error: '게임 중이 아니에요.' };
  if (team !== 'A' && team !== 'B') return { error: '팀 오류.' };
  s.presenter[team] = name;
  return { ok: true };
}

// 라운드 시작: 아직 안 한 팀(선공 우선)을 currentTeam으로. 출제자 지정 필수.
export function sqBegin(s, nowMs) {
  if (!s.active || (s.phase !== 'setup' && s.phase !== 'between')) return { error: '라운드를 시작할 수 없어요.' };
  if (!s.firstTeam) return { error: '선공 팀을 먼저 정하세요.' };
  const team = !s.done[s.firstTeam] ? s.firstTeam : (s.firstTeam === 'A' ? 'B' : 'A');
  if (s.done[team]) return { error: '두 팀 모두 끝났어요.' };
  if (!s.presenter[team]) return { error: '출제자를 먼저 지정하세요.' };
  s.currentTeam = team;
  s.phase = 'playing';
  s.roundEndsAt = nowMs + s.duration * 1000;
  return { ok: true, team };
}

const presenting = (s, name) => s.phase === 'playing' && name && s.presenter[s.currentTeam] === name;

export function sqCorrect(s, name) {
  if (!presenting(s, name)) return { error: '출제자만, 진행 중에만 가능해요.' };
  s.count[s.currentTeam] += 1;
  s.idx += 1;
  return { ok: true };
}

export function sqPass(s, name) {
  if (!presenting(s, name)) return { error: '출제자만, 진행 중에만 가능해요.' };
  s.idx += 1;
  return { ok: true };
}

// 라운드 종료(시간 만료 또는 진행자 강제). 두 팀 다 끝나면 승부 확정.
export function sqEndRound(s) {
  if (!s.active || s.phase !== 'playing') return { error: '진행 중인 라운드가 없어요.' };
  s.done[s.currentTeam] = true;
  s.roundEndsAt = null;
  s.currentTeam = null;
  if (s.done.A && s.done.B) {
    s.phase = 'done';
    s.winner = s.count.A === s.count.B ? 'draw' : (s.count.A > s.count.B ? 'A' : 'B');
  } else {
    s.phase = 'between';
  }
  return { ok: true, finished: s.phase === 'done', winner: s.winner };
}

// 타이머(전역 싱글톤) + 소켓 핸들러. server.js에서 한 번 setup 후 connection마다 register 호출.
export function setupSpeedQuiz({ io, room, broadcast }) {
  let sqTimer = null;
  const stopSqTimer = () => { if (sqTimer) { clearTimeout(sqTimer); sqTimer = null; } };
  const socketOf = (name) => { const p = name && room.players.get(name); return p?.socketId || null; };
  const sendSqWord = () => {
    const s = room.speedquiz;
    if (!s.active || s.phase !== 'playing') return;
    const sid = socketOf(s.presenter[s.currentTeam]);
    if (sid) io.to(sid).emit('sq:word', { word: sqWord(s) });
  };
  const clearSqWord = () => {
    for (const t of ['A', 'B']) { const sid = socketOf(room.speedquiz.presenter?.[t]); if (sid) io.to(sid).emit('sq:word', null); }
  };
  const finishRound = () => {
    const r = sqEndRound(room.speedquiz);
    stopSqTimer(); clearSqWord();
    if (r.finished && r.winner && r.winner !== 'draw' && room.tournament.active) addTeamScore(room.tournament, r.winner, 1);
    broadcast();
    return r;
  };
  const armSqTimer = () => {
    stopSqTimer();
    const s = room.speedquiz;
    if (s.active && s.phase === 'playing' && s.roundEndsAt) sqTimer = setTimeout(finishRound, Math.max(0, s.roundEndsAt - Date.now()));
  };

  return function registerSpeedQuiz(socket, { asHost, relay }) {
    socket.on('host:sq:start', ({ variantId, duration }) => asHost(() => {
      stopSqTimer();
      room.speedquiz = startSpeedQuiz(variantId, { duration }) || initSpeedQuiz();
      if (!room.speedquiz.active) io.to(socket.id).emit('host:error', '게임을 찾을 수 없어요.');
      broadcast();
    }));
    socket.on('host:sq:setFirst', ({ team }) => asHost(() => relay(sqSetFirst(room.speedquiz, team))));
    socket.on('host:sq:setPresenter', ({ team, name }) => asHost(() => {
      if (room.tournament.active && teamOf(room.tournament, name) !== team) return io.to(socket.id).emit('host:error', '그 팀 팀원만 출제자로 지정할 수 있어요.');
      relay(sqSetPresenter(room.speedquiz, team, name));
    }));
    socket.on('host:sq:begin', () => asHost(() => {
      const r = sqBegin(room.speedquiz, Date.now());
      if (r.error) return io.to(socket.id).emit('host:error', r.error);
      armSqTimer(); broadcast(); sendSqWord();
    }));
    socket.on('host:sq:endRound', () => asHost(() => { if (room.speedquiz.phase === 'playing') finishRound(); }));
    socket.on('host:sq:end', () => asHost(() => { stopSqTimer(); room.speedquiz = initSpeedQuiz(); broadcast(); }));
    socket.on('sq:correct', () => { if (!sqCorrect(room.speedquiz, socket.data.name).error) { broadcast(); sendSqWord(); } });
    socket.on('sq:pass', () => { if (!sqPass(room.speedquiz, socket.data.name).error) { broadcast(); sendSqWord(); } });
  };
}

// 클라이언트 공개 상태 — 현재 단어는 절대 포함하지 않음(출제자에게만 따로 전송).
export function speedQuizPublic(s) {
  if (!s?.active) return null;
  return {
    variant: s.variant,
    phase: s.phase,
    firstTeam: s.firstTeam,
    currentTeam: s.currentTeam,
    presenter: s.presenter,
    count: s.count,
    done: s.done,
    duration: s.duration,
    roundEndsAt: s.roundEndsAt,
    winner: s.winner,
    solved: s.count.A + s.count.B,
  };
}
