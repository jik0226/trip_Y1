// "룰 카드 + 결과 기록"형 게임 — 규칙만 띄우고 승부는 대면, 진행자가 승팀만 기록(→승점).
import { SIMPLE_GAMES } from './simplegames.js';
import { addTeamScore } from './tournament.js';

export function initSimple() { return { active: false }; }

export const simpleList = () => SIMPLE_GAMES.map((g) => ({ id: g.id, name: g.name, emoji: g.emoji, keyword: g.keyword }));

export function simplePublic(s) {
  if (!s?.active) return null;
  return { id: s.id, name: s.name, emoji: s.emoji, rule: s.rule, scoring: s.scoring, lastWin: s.lastWin || null };
}

export function registerSimple(socket, { room, broadcast, asHost, endOtherGames }) {
  socket.on('host:simple:start', ({ id }) => asHost(() => {
    const g = SIMPLE_GAMES.find((x) => x.id === id);
    if (!g) return;
    endOtherGames?.('simple');
    room.simple = { active: true, ...g, lastWin: null };
    broadcast();
  }));
  // #2 멱등: 이전 승팀이 기록돼 있으면 그 팀 점수 -1 후 새 팀 +1(잘못 누른 거 자동 정정).
  socket.on('host:simple:win', ({ team }) => asHost(() => {
    if (!room.simple.active) return;
    const prev = room.simple.lastWin;
    if (room.tournament.active) {
      if (prev === 'A' || prev === 'B') addTeamScore(room.tournament, prev, -1);
      if (team === 'A' || team === 'B') addTeamScore(room.tournament, team, 1);
    }
    room.simple.lastWin = team; // 'A' | 'B' | 'draw'
    broadcast();
  }));
  socket.on('host:simple:end', () => asHost(() => { room.simple = initSimple(); broadcast(); }));
}
