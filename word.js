// 이어말하기/외치기 — 랜덤 주제/끝글자 생성·표시 + 진행자 승팀 기록(→승점). 진행은 대면.
import { WORD_GAMES } from './wordgames.js';
import { addTeamScore } from './tournament.js';

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

export function initWord() { return { active: false }; }
export const wordList = () => WORD_GAMES.map((g) => ({ id: g.id, name: g.name, emoji: g.emoji }));

function genPrompt(g) {
  if (g.kind === 'ending') return `「~${pick(g.endings)}」(으)로 끝나는 단어!`;
  return `소재: 「${pick(g.topics)}」`;
}

export function wordPublic(s) {
  if (!s?.active) return null;
  return { id: s.id, name: s.name, emoji: s.emoji, rule: s.rule, prompt: s.prompt, lastWin: s.lastWin || null };
}

export function registerWord(socket, { room, broadcast, asHost, endOtherGames }) {
  socket.on('host:word:start', ({ id }) => asHost(() => {
    const g = WORD_GAMES.find((x) => x.id === id);
    if (!g) return;
    endOtherGames?.('word');
    room.word = { active: true, id: g.id, name: g.name, emoji: g.emoji, rule: g.rule, prompt: genPrompt(g), lastWin: null };
    broadcast();
  }));
  socket.on('host:word:roll', () => asHost(() => {
    const g = room.word.active && WORD_GAMES.find((x) => x.id === room.word.id);
    if (g) { room.word.prompt = genPrompt(g); room.word.lastWin = null; broadcast(); }
  }));
  // #2 멱등: 이전 승팀 자동 정정.
  socket.on('host:word:win', ({ team }) => asHost(() => {
    if (!room.word.active) return;
    const prev = room.word.lastWin;
    if (room.tournament.active) {
      if (prev === 'A' || prev === 'B') addTeamScore(room.tournament, prev, -1);
      if (team === 'A' || team === 'B') addTeamScore(room.tournament, team, 1);
    }
    room.word.lastWin = team;
    broadcast();
  }));
  socket.on('host:word:end', () => asHost(() => { room.word = initWord(); broadcast(); }));
}
