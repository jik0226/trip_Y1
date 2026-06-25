// 출제자 스피드 퀴즈. 변형에 따라 presenters=1(기본) 또는 2(고요속외침: 헤드셋 2명, 번갈아).
// 1명: 출제자 본인이 정답/패스. 2명+토너먼트: 같은 팀 누구나 정답/패스(나머지 팀원이 판정).
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
  const presenters = Math.max(1, Math.min(2, Number(v.presenters) || 1));
  return {
    active: true,
    variant: { id: v.id, name: v.name, emoji: v.emoji, keyword: v.keyword, conveyance: v.conveyance, presenters },
    words: shuffle(v.words),
    idx: 0,
    phase: 'setup',                  // setup | playing | between | done
    firstTeam: null,
    currentTeam: null,
    presenter: { A: [], B: [] },     // 출제자 배열 (variant.presenters만큼)
    curIdx: 0,                       // 라운드 내 현재 차례 (0..presenters-1)
    count: { A: 0, B: 0 },
    done: { A: false, B: false },
    duration: Math.min(180, Math.max(5, Number(opts.duration) || 60)),
    roundEndsAt: null,
    winner: null,
  };
}

export const sqWord = (s) => (s?.active ? s.words[s.idx % s.words.length] : null);
export const sqCurrentPresenter = (s) =>
  (s?.active && s.currentTeam && s.presenter[s.currentTeam] || [])[s.curIdx || 0] || null;

export function sqSetFirst(s, team) {
  if (!s.active || s.phase !== 'setup') return { error: '시작 전에만 선공을 정할 수 있어요.' };
  if (team !== 'A' && team !== 'B') return { error: '팀 오류.' };
  s.firstTeam = team;
  return { ok: true };
}

// 출제자 토글 (이미 있으면 빼고, 없으면 추가). presenters=1이면 교체. 초과 시 거부.
export function sqSetPresenter(s, team, name) {
  if (!s.active) return { error: '게임 중이 아니에요.' };
  if (team !== 'A' && team !== 'B') return { error: '팀 오류.' };
  const cap = s.variant.presenters || 1;
  const list = s.presenter[team];
  const at = list.indexOf(name);
  if (at >= 0) { list.splice(at, 1); return { ok: true }; }
  if (cap === 1) { list.length = 0; list.push(name); return { ok: true }; }
  if (list.length >= cap) return { error: `이 게임은 출제자 ${cap}명까지예요.` };
  list.push(name);
  return { ok: true };
}

// 라운드 시작 — 출제자 cap만큼 채워야 함.
export function sqBegin(s, nowMs) {
  if (!s.active || (s.phase !== 'setup' && s.phase !== 'between')) return { error: '라운드를 시작할 수 없어요.' };
  if (!s.firstTeam) return { error: '선공 팀을 먼저 정하세요.' };
  const team = !s.done[s.firstTeam] ? s.firstTeam : (s.firstTeam === 'A' ? 'B' : 'A');
  if (s.done[team]) return { error: '두 팀 모두 끝났어요.' };
  const cap = s.variant.presenters || 1;
  if ((s.presenter[team] || []).length < cap) return { error: `출제자 ${cap}명을 모두 지정하세요.` };
  s.currentTeam = team;
  s.curIdx = 0;
  s.phase = 'playing';
  s.roundEndsAt = nowMs + s.duration * 1000;
  return { ok: true, team };
}

// 정답/패스 권한:
//   presenters=1 → 현재 출제자 본인만
//   presenters=2 + 토너먼트 진행 중 → currentTeam 멤버 누구나(나머지 팀원이 판정)
function canJudge(s, name, tournament) {
  if (s.phase !== 'playing' || !name) return false;
  const cap = s.variant.presenters || 1;
  if (cap === 1) return sqCurrentPresenter(s) === name;
  if (tournament?.active) return teamOf(tournament, name) === s.currentTeam;
  return (s.presenter[s.currentTeam] || []).includes(name);
}

export function sqCorrect(s, name, tournament) {
  if (!canJudge(s, name, tournament)) return { error: '권한이 없거나 진행 중이 아니에요.' };
  s.count[s.currentTeam] += 1;
  s.idx += 1;
  const cap = s.variant.presenters || 1;
  s.curIdx = (s.curIdx + 1) % cap;
  return { ok: true };
}

export function sqPass(s, name, tournament) {
  if (!canJudge(s, name, tournament)) return { error: '권한이 없거나 진행 중이 아니에요.' };
  s.idx += 1;
  const cap = s.variant.presenters || 1;
  s.curIdx = (s.curIdx + 1) % cap;
  return { ok: true };
}

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
  // 현재 출제자에게만 단어 송신, 나머지 출제자에겐 null로 정리.
  const sendSqWord = () => {
    const s = room.speedquiz;
    if (!s.active || s.phase !== 'playing') return;
    const current = sqCurrentPresenter(s);
    for (const t of ['A', 'B']) for (const n of (s.presenter[t] || [])) {
      const sid = socketOf(n);
      if (!sid) continue;
      io.to(sid).emit('sq:word', n === current ? { word: sqWord(s) } : null);
    }
  };
  const clearSqWord = () => {
    for (const t of ['A', 'B']) for (const n of (room.speedquiz.presenter?.[t] || [])) {
      const sid = socketOf(n);
      if (sid) io.to(sid).emit('sq:word', null);
    }
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

  const endSelf = () => { stopSqTimer(); room.speedquiz = initSpeedQuiz(); };

  return { end: endSelf, register: function registerSpeedQuiz(socket, { asHost, relay, endOtherGames }) {
    socket.on('host:sq:start', ({ variantId, duration }) => asHost(() => {
      stopSqTimer();
      endOtherGames?.('speedquiz');
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
    socket.on('sq:correct', () => { if (!sqCorrect(room.speedquiz, socket.data.name, room.tournament).error) { broadcast(); sendSqWord(); } });
    socket.on('sq:pass', () => { if (!sqPass(room.speedquiz, socket.data.name, room.tournament).error) { broadcast(); sendSqWord(); } });
  } };
}

// 클라이언트 공개 상태 — 현재 단어는 절대 포함하지 않음(출제자에게만 따로 전송).
export function speedQuizPublic(s) {
  if (!s?.active) return null;
  return {
    variant: s.variant,
    phase: s.phase,
    firstTeam: s.firstTeam,
    currentTeam: s.currentTeam,
    presenter: s.presenter,                  // 배열
    curIdx: s.curIdx,
    presenters: s.variant.presenters || 1,
    count: s.count,
    done: s.done,
    duration: s.duration,
    roundEndsAt: s.roundEndsAt,
    winner: s.winner,
    solved: s.count.A + s.count.B,
  };
}
