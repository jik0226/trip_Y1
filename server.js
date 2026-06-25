// Class trip game server — single fixed room for our 8 friends.
// No room codes: open the site, pick your name, you're in.
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { NAMES, DEFAULT_HOST } from './players.js';
import { TEAM_CONFIG } from './teams.js';
import { initTournament, teamOf, tournamentPublic, registerTournament } from './tournament.js';
import { SPEED_GAMES } from './speedgames.js';
import { initSpeedQuiz, sqWord, speedQuizPublic, setupSpeedQuiz } from './speedquiz.js';
import { LIAR_TOPICS } from './liargames.js';
import { initLiar, liarPublic, registerLiar } from './liar.js';
import { initSimple, simplePublic, simpleList, registerSimple } from './simple.js';
import { initCoin, registerCoin } from './coin.js';
import { initFlow, flowPublic, registerFlow } from './flow.js';
import { initWord, wordPublic, wordList, registerWord } from './word.js';
import { initQuiz, quizPublic, quizCategories, registerQuiz } from './quiz.js';
import { initHeadband, headbandPublic, headbandSources, headbandYou, registerHeadband } from './headband.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer);
app.use(express.static(join(__dirname, 'public')));

// One room, players keyed by their (fixed) name.
const room = {
  hostId: null,
  tournament: initTournament(),
  speedquiz: initSpeedQuiz(),
  liar: initLiar(),
  simple: initSimple(),
  coin: initCoin(),
  flow: initFlow(),
  word: initWord(),
  quiz: initQuiz(),
  headband: initHeadband(),
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
  speedGames: Object.values(SPEED_GAMES).map((g) => ({
    id: g.id, name: g.name, emoji: g.emoji, keyword: g.keyword,
  })),
  tournament: tournamentPublic(room.tournament),
  speedquiz: speedQuizPublic(room.speedquiz),
  liar: liarPublic(room.liar),
  liarCategories: Object.keys(LIAR_TOPICS),
  simple: simplePublic(room.simple),
  simpleGames: simpleList(),
  coin: room.coin,
  flow: flowPublic(room.flow),
  word: wordPublic(room.word),
  wordGames: wordList(),
  quiz: quizPublic(room.quiz),
  quizCategories: quizCategories(),
  headband: headbandPublic(room.headband),
  headbandSources: headbandSources(),
});

const broadcast = () => io.emit('room:update', publicState());

// 스피드 퀴즈 런타임(타이머 등)은 한 번만 생성 — connection마다 register만 호출.
const sqRuntime = setupSpeedQuiz({ io, room, broadcast });
const registerSpeedQuiz = sqRuntime.register;

// 새 게임 시작 시 다른 게임을 자동으로 종료(중첩 노출 방지). 메타(coin/flow/tournament)는 유지.
const endOtherGames = (keep) => {
  if (keep !== 'speedquiz') sqRuntime.end();
  if (keep !== 'liar') room.liar = initLiar();
  if (keep !== 'simple') room.simple = initSimple();
  if (keep !== 'word') room.word = initWord();
  if (keep !== 'quiz') room.quiz = initQuiz();
  if (keep !== 'headband') room.headband = initHeadband();
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
    // 기본 진행자(인겸)가 들어오면 자동 진행자 지정. 끊긴 좀비 호스트 소켓도 감지해 재바인딩(#5).
    if (name === DEFAULT_HOST) {
      const hostAlive = room.hostId && io.sockets.sockets.get(room.hostId);
      if (!hostAlive) room.hostId = socket.id;
    }
    cb?.({ ok: true, name });
    broadcast();
    // 스피드 퀴즈 진행 중 출제자가 재접속하면 단어 다시 전송.
    const sq = room.speedquiz;
    if (sq.active && sq.phase === 'playing' && sq.presenter[sq.currentTeam] === name) {
      io.to(socket.id).emit('sq:word', { word: sqWord(sq) });
    }
    // 양세찬게임 진행 중이면 비밀 다시 전송(재접속 대응).
    if (room.headband.active) {
      io.to(socket.id).emit('headband:you', headbandYou(room.headband, name));
    }
  });

  // 진행자는 기본 진행자(인겸)만 될 수 있음.
  socket.on('becomeHost', (_, cb) => {
    if (socket.data.name !== DEFAULT_HOST) return cb?.({ ok: false, error: '진행자는 인겸만 가능해요.' });
    room.hostId = socket.id;
    cb?.({ ok: true });
    broadcast();
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

  // --- 모듈별 이벤트 핸들러 등록 ---
  const relay = (res) => { if (res?.error) io.to(socket.id).emit('host:error', res.error); broadcast(); };
  const ctx = { io, room, broadcast, asHost, relay, endOtherGames };
  registerTournament(socket, ctx);
  registerSpeedQuiz(socket, ctx);
  registerLiar(socket, ctx);
  registerSimple(socket, ctx);
  registerCoin(socket, ctx);
  registerFlow(socket, ctx);
  registerWord(socket, ctx);
  registerQuiz(socket, ctx);
  registerHeadband(socket, ctx);

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
