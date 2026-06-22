// 라이어게임 상태 기계 + 소켓 핸들러 등록.
// 한 명이 라이어(제시어 모름), 나머지는 시민(제시어 앎). 설명 → 투표 → 라이어 색출.
import { LIAR_TOPICS } from './liargames.js';

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const shuffle = (arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
};

export function initLiar() { return { active: false }; }

export function startLiar(participants, opts = {}) {
  if (participants.length < 3) return null;
  const category = (opts.category && LIAR_TOPICS[opts.category]) ? opts.category : pick(Object.keys(LIAR_TOPICS));
  return {
    active: true,
    category,
    keyword: pick(LIAR_TOPICS[category]),
    liar: pick(participants),
    participants: [...participants],
    order: shuffle(participants),
    phase: 'describe', // describe | vote | result
    votes: {},
    result: null,
  };
}

// 참가자 개인에게만 보내는 비밀 정보.
export function liarYou(s, name) {
  if (!s?.active || !s.participants.includes(name)) return null;
  const isLiar = s.liar === name;
  return { role: isLiar ? '라이어' : '시민', isLiar, category: s.category, keyword: isLiar ? null : s.keyword };
}

export function liarToVote(s) {
  if (!s?.active || s.phase !== 'describe') return { error: '설명 단계가 아니에요.' };
  s.phase = 'vote'; s.votes = {};
  return { ok: true };
}

export function liarVote(s, voter, target) {
  if (!s?.active || s.phase !== 'vote') return { error: '투표 단계가 아니에요.' };
  if (!s.participants.includes(voter)) return { error: '참가자가 아니에요.' };
  if (!s.participants.includes(target) || target === voter) return { error: '다른 참가자에게 투표하세요.' };
  s.votes[voter] = target;
  return { ok: true };
}

export function liarReveal(s) {
  if (!s?.active) return { error: '게임 중이 아니에요.' };
  const tally = {};
  for (const t of Object.values(s.votes)) tally[t] = (tally[t] || 0) + 1;
  const max = Math.max(0, ...Object.values(tally));
  const top = Object.keys(tally).filter((k) => tally[k] === max);
  const mostVoted = top.length === 1 ? top[0] : null; // 동률이면 색출 실패
  const caught = mostVoted === s.liar;
  s.result = { liar: s.liar, keyword: s.keyword, tally, mostVoted, caught, liarWins: !caught, guessUsed: false };
  s.phase = 'result';
  return { ok: true };
}

// 잡혔어도 라이어가 제시어를 맞히면 역전승 (진행자가 판정).
export function liarGuessResult(s, success) {
  if (s?.phase !== 'result' || !s.result) return { error: '결과 단계가 아니에요.' };
  if (!s.result.caught) return { error: '라이어가 이미 안 잡혔어요.' };
  s.result.guessUsed = true;
  if (success) s.result.liarWins = true;
  return { ok: true };
}

// 공개 상태 — 결과 전에는 라이어/제시어 절대 비공개.
export function liarPublic(s) {
  if (!s?.active) return null;
  const base = {
    category: s.category, phase: s.phase, order: s.order, participants: s.participants,
    voteCount: Object.keys(s.votes).length, voted: s.phase === 'vote' ? Object.keys(s.votes) : [],
  };
  if (s.phase === 'result') base.result = s.result;
  return base;
}

// 소켓 핸들러 등록 (server.js의 connection 안에서 호출).
export function registerLiar(socket, { io, room, broadcast, asHost, relay }) {
  const socketOf = (name) => { const p = name && room.players.get(name); return p?.socketId || null; };
  const sendSecrets = () => {
    const s = room.liar;
    if (!s.active) return;
    for (const n of s.participants) { const sid = socketOf(n); if (sid) io.to(sid).emit('liar:you', liarYou(s, n)); }
  };

  socket.on('host:liar:start', ({ category } = {}) => asHost(() => {
    const parts = [...room.players.values()].filter((p) => p.connected).map((p) => p.name);
    const st = startLiar(parts, { category });
    if (!st) return io.to(socket.id).emit('host:error', '라이어게임은 최소 3명 접속이 필요해요.');
    room.liar = st; broadcast(); sendSecrets();
  }));
  socket.on('host:liar:toVote', () => asHost(() => relay(liarToVote(room.liar))));
  socket.on('liar:vote', ({ target }) => { if (socket.data.name) relay(liarVote(room.liar, socket.data.name, target)); });
  socket.on('host:liar:reveal', () => asHost(() => relay(liarReveal(room.liar))));
  socket.on('host:liar:guess', ({ success }) => asHost(() => relay(liarGuessResult(room.liar, success))));
  socket.on('host:liar:end', () => asHost(() => { room.liar = initLiar(); broadcast(); }));
  socket.on('liar:whoami', () => {
    const s = room.liar;
    if (s.active && socket.data.name && s.participants.includes(socket.data.name)) {
      io.to(socket.id).emit('liar:you', liarYou(s, socket.data.name));
    }
  });
}
