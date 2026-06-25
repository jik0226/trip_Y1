// 양세찬 게임(헤드밴드형) — 각 참가자에게 다른 단어 배정. 본인은 자기 단어만 모르고,
// 남들 단어는 다 보임. 질문해서 자기 단어 맞히기. 단어는 스피드퀴즈 풀에서 가져옴.
import { SPEED_GAMES } from './speedgames.js';
import { addTeamScore } from './tournament.js';

const shuffle = (arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
};

export function initHeadband() { return { active: false }; }

// 단어 풀 출처 목록 (진행자 선택용).
export const headbandSources = () =>
  Object.values(SPEED_GAMES).map((g) => ({ id: g.id, name: g.name, emoji: g.emoji }));

export function startHeadband({ participants, sourceId }) {
  const src = SPEED_GAMES[sourceId] || SPEED_GAMES[Object.keys(SPEED_GAMES)[0]];
  if (!participants || participants.length < 2) return null;
  const words = shuffle(src.words).slice(0, participants.length);
  const assignments = {};
  participants.forEach((n, i) => (assignments[n] = words[i]));
  return {
    active: true,
    sourceId: src.id,
    sourceName: src.name,
    participants: [...participants],
    assignments,
    revealed: false,
    lastWin: null,
  };
}

// 공개 상태 — 단어는 절대 미포함(revealed=true일 때만 진행자/관전에게 전체 보임).
export function headbandPublic(s) {
  if (!s?.active) return null;
  return {
    sourceName: s.sourceName,
    participants: s.participants,
    revealed: s.revealed,
    lastWin: s.lastWin,
    answers: s.revealed ? s.assignments : null,
  };
}

// 각 사람에게 보낼 개인 비밀(자기 단어는 null, 남들 단어는 다 보임).
export function headbandYou(s, name) {
  if (!s?.active) return null;
  const isParticipant = s.participants.includes(name);
  const visible = {};
  for (const p of s.participants) {
    if (isParticipant && p === name) continue; // 본인 거만 숨김
    visible[p] = s.assignments[p];
  }
  return { isParticipant, participants: s.participants, visible, sourceName: s.sourceName };
}

export function registerHeadband(socket, { io, room, broadcast, asHost, endOtherGames }) {
  const sendSecrets = () => {
    if (!room.headband.active) return;
    for (const p of room.players.values()) {
      if (!p.connected || !p.socketId) continue;
      io.to(p.socketId).emit('headband:you', headbandYou(room.headband, p.name));
    }
  };

  socket.on('host:headband:start', ({ participants, sourceId }) => asHost(() => {
    const connected = [...room.players.values()].filter((p) => p.connected).map((p) => p.name);
    const valid = (participants || []).filter((n) => connected.includes(n));
    const st = startHeadband({ participants: valid, sourceId });
    if (!st) return io.to(socket.id).emit('host:error', '참가자를 2명 이상 선택하세요.');
    endOtherGames?.('headband');
    room.headband = st;
    broadcast(); sendSecrets();
  }));
  socket.on('host:headband:reveal', () => asHost(() => {
    if (!room.headband.active) return;
    room.headband.revealed = true; broadcast();
  }));
  // 룰카드처럼 멱등 승팀 처리(잘못 누른 거 자동 정정).
  socket.on('host:headband:win', ({ team }) => asHost(() => {
    if (!room.headband.active) return;
    const prev = room.headband.lastWin;
    if (room.tournament.active) {
      if (prev === 'A' || prev === 'B') addTeamScore(room.tournament, prev, -1);
      if (team === 'A' || team === 'B') addTeamScore(room.tournament, team, 1);
    }
    room.headband.lastWin = team;
    broadcast();
  }));
  socket.on('host:headband:end', () => asHost(() => { room.headband = initHeadband(); broadcast(); }));
  // 참가자가 재접속 시 자기 비밀 다시 요청.
  socket.on('headband:whoami', () => {
    if (room.headband.active && socket.data.name) {
      io.to(socket.id).emit('headband:you', headbandYou(room.headband, socket.data.name));
    }
  });
}
