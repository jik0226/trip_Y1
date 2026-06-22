// Class trip game server — single fixed room for our 8 friends.
// No room codes: open the site, pick your name, you're in.
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { GAMES } from './games.js';
import { NAMES, DEFAULT_HOST } from './players.js';
import { TEAM_CONFIG } from './teams.js';
import {
  initTournament, startTournament, addTeamScore, endTime, startSwap,
  leaderPick, castVote, forceResolve, teamOf, tournamentPublic,
  movePlayer, setLeader,
} from './tournament.js';
import { SPEED_GAMES } from './speedgames.js';
import {
  initSpeedQuiz, startSpeedQuiz, sqWord, sqSetFirst, sqSetPresenter,
  sqBegin, sqCorrect, sqPass, sqEndRound, speedQuizPublic,
} from './speedquiz.js';
import { LIAR_TOPICS } from './liargames.js';
import { initLiar, liarPublic, registerLiar } from './liar.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer);
app.use(express.static(join(__dirname, 'public')));

// One room, players keyed by their (fixed) name.
const room = {
  hostId: null,
  game: null,
  tournament: initTournament(),
  speedquiz: initSpeedQuiz(),
  liar: initLiar(),
  players: new Map(
    NAMES.map((name) => [name, { name, team: null, score: 0, connected: false, socketId: null, clientId: null }])
  ),
};

// 현재 팀장 2명 (토너먼트 진행 중이면 그 팀장, 아니면 기본 설정).
const currentLeaders = () => {
  const t = room.tournament;
  return t?.active
    ? { A: t.teams.A.leader, B: t.teams.B.leader }
    : { A: TEAM_CONFIG.A.leader, B: TEAM_CONFIG.B.leader };
};
const nameOfSocket = (sid) => {
  for (const p of room.players.values()) if (p.socketId === sid) return p.name;
  return null;
};

const publicState = () => ({
  players: NAMES.map((n) => {
    const p = room.players.get(n);
    return { id: n, name: n, team: teamOf(room.tournament, n), score: p.score, connected: p.connected };
  }),
  hostId: room.hostId,
  hostName: nameOfSocket(room.hostId),
  defaultHost: DEFAULT_HOST,
  leaders: currentLeaders(),
  game: room.game
    ? { id: room.game.id, name: room.game.name, emoji: room.game.emoji, public: room.game.public }
    : null,
  games: Object.values(GAMES).map((g) => ({
    id: g.id, name: g.name, emoji: g.emoji, desc: g.desc, minPlayers: g.minPlayers,
  })),
  speedGames: Object.values(SPEED_GAMES).map((g) => ({
    id: g.id, name: g.name, emoji: g.emoji, keyword: g.keyword,
  })),
  tournament: tournamentPublic(room.tournament),
  speedquiz: speedQuizPublic(room.speedquiz),
  liar: liarPublic(room.liar),
  liarCategories: Object.keys(LIAR_TOPICS),
});

const broadcast = () => io.emit('room:update', publicState());

const sendYou = () => {
  for (const p of room.players.values()) {
    if (!p.connected || !p.socketId) continue;
    io.to(p.socketId).emit('you:update', room.game?.perPlayer?.[p.name] || null);
  }
};

// --- 스피드 퀴즈: 타이머 + 출제자 단어 전송 ---
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
  if (r.finished && r.winner && r.winner !== 'draw' && room.tournament.active) {
    addTeamScore(room.tournament, r.winner, 1); // 이긴 팀에 승점 +1
  }
  broadcast();
  return r;
};
const armSqTimer = () => {
  stopSqTimer();
  const s = room.speedquiz;
  if (s.active && s.phase === 'playing' && s.roundEndsAt) {
    sqTimer = setTimeout(finishRound, Math.max(0, s.roundEndsAt - Date.now()));
  }
};

io.on('connection', (socket) => {
  socket.emit('room:update', publicState()); // 홈 화면이 이름 카드/접속현황을 바로 그릴 수 있게

  socket.on('claim', ({ name, clientId }, cb) => {
    const p = room.players.get(name);
    if (!p) return cb?.({ ok: false, error: '명단에 없는 이름이에요.' });
    // 이미 다른 기기/사람이 접속 중이면 차단 (같은 브라우저의 새로고침·재접속은 clientId로 허용).
    if (p.connected && p.clientId && clientId && p.clientId !== clientId) {
      return cb?.({ ok: false, error: `${name}(으)로 이미 접속 중이에요. 다른 이름을 골라주세요.` });
    }
    if (socket.data.name && socket.data.name !== name) {
      const prev = room.players.get(socket.data.name); // 이름 바꿔 선택
      if (prev && prev.socketId === socket.id) { prev.connected = false; prev.socketId = null; }
    }
    p.connected = true;
    p.socketId = socket.id;
    p.clientId = clientId || p.clientId;
    socket.data.name = name;
    // 기본 진행자(인겸)가 들어오고 현재 진행자가 없으면 자동으로 진행자 지정.
    if (name === DEFAULT_HOST && !room.hostId) room.hostId = socket.id;
    cb?.({ ok: true, name });
    broadcast();
    io.to(socket.id).emit('you:update', room.game?.perPlayer?.[name] || null);
    if (room.hostId === socket.id) io.to(socket.id).emit('host:reveal', room.game?.host || null);
    // 스피드 퀴즈 진행 중 출제자가 재접속하면 단어 다시 전송.
    const sq = room.speedquiz;
    if (sq.active && sq.phase === 'playing' && sq.presenter[sq.currentTeam] === name) {
      io.to(socket.id).emit('sq:word', { word: sqWord(sq) });
    }
  });

  // 진행자는 기본 진행자(인겸)만 될 수 있음.
  socket.on('becomeHost', (_, cb) => {
    if (socket.data.name !== DEFAULT_HOST) return cb?.({ ok: false, error: '진행자는 인겸만 가능해요.' });
    room.hostId = socket.id;
    cb?.({ ok: true });
    broadcast();
    io.to(socket.id).emit('host:reveal', room.game?.host || null);
  });

  const asHost = (fn) => { if (room.hostId === socket.id) fn(); };

  socket.on('host:setTeam', ({ playerId, team }) =>
    asHost(() => { const p = room.players.get(playerId); if (p) { p.team = team || null; broadcast(); } }));

  socket.on('host:addScore', ({ playerId, delta }) =>
    asHost(() => {
      const p = room.players.get(playerId);
      if (p) { p.score = Math.max(0, p.score + (Number(delta) || 0)); broadcast(); }
    }));

  socket.on('host:resetScores', () =>
    asHost(() => { for (const p of room.players.values()) p.score = 0; broadcast(); }));

  socket.on('host:startGame', ({ gameId, config }) =>
    asHost(() => {
      const def = GAMES[gameId];
      if (!def) return;
      const participants = [...room.players.values()]
        .filter((p) => p.connected)
        .map((p) => ({ id: p.name, name: p.name, team: p.team, score: p.score }));
      if (participants.length < (def.minPlayers || 1)) {
        io.to(socket.id).emit('host:error', `${def.name}은(는) 최소 ${def.minPlayers}명 필요해요. (현재 ${participants.length}명 접속)`);
        return;
      }
      const result = def.assign(participants, config || {});
      room.game = {
        id: def.id, name: def.name, emoji: def.emoji,
        public: result.public || {}, perPlayer: result.perPlayer || {}, host: result.host || null,
      };
      broadcast();
      sendYou();
      io.to(socket.id).emit('host:reveal', room.game.host);
    }));

  socket.on('host:endGame', () =>
    asHost(() => {
      room.game = null;
      broadcast();
      sendYou();
      io.to(socket.id).emit('host:reveal', null);
    }));

  // --- 팀전 토너먼트 ---
  const relay = (res) => { if (res?.error) io.to(socket.id).emit('host:error', res.error); broadcast(); };

  socket.on('host:startTournament', () =>
    asHost(() => { room.tournament = startTournament(); broadcast(); }));

  socket.on('host:teamScore', ({ team, delta }) =>
    asHost(() => { addTeamScore(room.tournament, team, delta); broadcast(); }));

  socket.on('host:endTime', () => asHost(() => relay(endTime(room.tournament))));

  socket.on('host:startSwap', ({ method }) => asHost(() => relay(startSwap(room.tournament, method))));

  socket.on('host:forceSwap', () => asHost(() => relay(forceResolve(room.tournament))));

  socket.on('host:endTournament', () =>
    asHost(() => { room.tournament = initTournament(); broadcast(); }));

  // 진행자 수동 팀 컨트롤
  socket.on('host:movePlayer', ({ name, toTeam }) => asHost(() => relay(movePlayer(room.tournament, name, toTeam))));
  socket.on('host:setLeader', ({ name }) => asHost(() => relay(setLeader(room.tournament, name))));

  // --- 스피드 퀴즈 (출제자형) ---
  socket.on('host:sq:start', ({ variantId, duration }) => asHost(() => {
    stopSqTimer(); room.game = null;
    room.speedquiz = startSpeedQuiz(variantId, { duration }) || initSpeedQuiz();
    if (!room.speedquiz.active) io.to(socket.id).emit('host:error', '게임을 찾을 수 없어요.');
    broadcast();
  }));
  socket.on('host:sq:setFirst', ({ team }) => asHost(() => relay(sqSetFirst(room.speedquiz, team))));
  socket.on('host:sq:setPresenter', ({ team, name }) => asHost(() => {
    if (room.tournament.active && teamOf(room.tournament, name) !== team) {
      return io.to(socket.id).emit('host:error', '그 팀 팀원만 출제자로 지정할 수 있어요.');
    }
    relay(sqSetPresenter(room.speedquiz, team, name));
  }));
  socket.on('host:sq:begin', () => asHost(() => {
    const r = sqBegin(room.speedquiz, Date.now());
    if (r.error) return io.to(socket.id).emit('host:error', r.error);
    armSqTimer(); broadcast(); sendSqWord();
  }));
  socket.on('host:sq:endRound', () => asHost(() => {
    if (room.speedquiz.phase !== 'playing') return;
    finishRound();
  }));
  socket.on('host:sq:end', () => asHost(() => { stopSqTimer(); room.speedquiz = initSpeedQuiz(); broadcast(); }));

  // 출제자 본인 조작
  socket.on('sq:correct', () => { if (!sqCorrect(room.speedquiz, socket.data.name).error) { broadcast(); sendSqWord(); } });
  socket.on('sq:pass', () => { if (!sqPass(room.speedquiz, socket.data.name).error) { broadcast(); sendSqWord(); } });

  // 라이어게임 (핸들러는 liar.js)
  registerLiar(socket, { io, room, broadcast, asHost, relay });

  // 팀장 지정 / 다수결 투표 — 참가자 본인 소켓에서 발생
  socket.on('leader:pick', ({ target }) => {
    if (!socket.data.name) return;
    relay(leaderPick(room.tournament, socket.data.name, target));
  });

  socket.on('swap:vote', ({ target }) => {
    if (!socket.data.name) return;
    relay(castVote(room.tournament, socket.data.name, target));
  });

  socket.on('disconnect', () => {
    if (room.hostId === socket.id) room.hostId = null;
    const p = socket.data.name ? room.players.get(socket.data.name) : null;
    if (p && p.socketId === socket.id) { p.connected = false; p.socketId = null; }
    broadcast();
  });
});

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
  console.log(`\n🐙 게임 서버 실행 중!`);
  console.log(`   로컬:   http://localhost:${PORT}`);
  console.log(`   같은 와이파이의 폰에서 접속하려면 노트북 IP를 쓰세요 (예: http://192.168.x.x:${PORT})\n`);
});
