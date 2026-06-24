// 키워드 게임 뽑기 플로우 — 진 팀(또는 동전 추첨) 팀장이 추상 키워드를 골라 게임을 뽑는다.
// 매 선택마다 안 한 게임에 랜덤 추상 키워드를 새로 배정 → 예측 불가. 공개 상태엔 키워드만 노출.
// 실제 게임 진행은 기존 컨트롤로(여기선 선택·공개·중복방지만 담당, 과결합 회피).
import { SPEED_GAMES } from './speedgames.js';
import { SIMPLE_GAMES } from './simplegames.js';
import { WORD_GAMES } from './wordgames.js';
import { QUIZ_SETS } from './quizgames.js';
import { AUDIO_MODES } from './songgames.js';

// 게임 수보다 넉넉해야 함(부족하면 키워드 미배정 발생). 게임 늘면 여기도 늘리기.
const ABSTRACT = [
  '번개', '심장', '미궁', '운명', '폭풍', '정글', '가면', '나침반', '모래시계', '불꽃',
  '소용돌이', '등대', '신기루', '화산', '빙하', '그림자', '천둥', '회오리', '별똥별', '오로라',
  '미로', '파도', '사막', '깃털', '자석', '거울', '열쇠', '퍼즐', '발자국', '나비',
  '용암', '심연', '폭죽', '수정', '나선', '메아리', '오아시스', '혜성',
];

// 선택 가능한 게임 통합 레지스트리 (정체는 뽑기 전까지 숨김).
const REGISTRY = [
  ...Object.values(SPEED_GAMES).map((g) => ({ id: 'sq:' + g.id, name: g.name, emoji: g.emoji, kind: 'speed' })),
  { id: 'liar', name: '라이어게임', emoji: '🤥', kind: 'liar' },
  ...SIMPLE_GAMES.map((g) => ({ id: 'simple:' + g.id, name: g.name, emoji: g.emoji, kind: 'simple' })),
  ...WORD_GAMES.map((g) => ({ id: 'word:' + g.id, name: g.name, emoji: g.emoji, kind: 'word' })),
  ...Object.keys(QUIZ_SETS).map((c) => ({ id: 'quiz:' + c, name: c + ' 퀴즈', emoji: '❓', kind: 'quiz' })),
  ...Object.entries(AUDIO_MODES).map(([id, m]) => ({ id: 'audio:' + id, name: m.label, emoji: m.emoji, kind: 'audio' })),
];

const shuffle = (arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
};

export function initFlow() { return { active: false }; }

// 선택권을 team에게 주고, 안 한 게임에 랜덤 추상 키워드를 새로 배정.
function makeMenu(f, team) {
  const avail = REGISTRY.filter((g) => !f.playedIds.includes(g.id));
  const kws = shuffle(ABSTRACT).slice(0, avail.length);
  f.menu = shuffle(avail).map((g, i) => ({ keyword: kws[i], id: g.id, name: g.name, emoji: g.emoji }));
  f.selector = team;
  f.lastPick = null;
}

export function flowPublic(f) {
  if (!f?.active) return null;
  return {
    selector: f.selector,
    menu: f.menu ? f.menu.map((m) => m.keyword) : null, // 키워드만 공개(게임 정체 숨김)
    lastPick: f.lastPick, // 뽑은 뒤엔 공개 OK { keyword, name, emoji }
    playedCount: f.playedIds.length,
    total: REGISTRY.length,
  };
}

export function registerFlow(socket, { room, broadcast, asHost }) {
  socket.on('host:flow:start', () => asHost(() => {
    room.flow = { active: true, selector: null, menu: null, playedIds: [], lastPick: null };
    broadcast();
  }));
  // 진행자가 특정 팀에게 선택권 (진 팀 등).
  socket.on('host:flow:selector', ({ team }) => asHost(() => {
    if (room.flow.active && (team === 'A' || team === 'B')) { makeMenu(room.flow, team); broadcast(); }
  }));
  // 동전으로 선택팀 추첨 (전원 화면 동전 + 선택권 자동 배정).
  socket.on('host:flow:coinSelector', () => asHost(() => {
    if (!room.flow.active) return;
    const result = Math.floor(Math.random() * 2);
    room.coin = { id: (room.coin?.id || 0) + 1, title: '게임 선택권 추첨', options: ['A팀', 'B팀'], result };
    makeMenu(room.flow, result === 0 ? 'A' : 'B');
    broadcast();
  }));
  // 선택팀 팀장이 키워드를 고름.
  socket.on('flow:pick', ({ keyword }) => {
    const f = room.flow, t = room.tournament;
    if (!f?.active || !f.menu || !t.active) return;
    if (socket.data.name !== t.teams[f.selector]?.leader) return; // 선택팀 팀장만
    const e = f.menu.find((m) => m.keyword === keyword);
    if (!e) return;
    f.playedIds.push(e.id);
    f.lastPick = { keyword: e.keyword, name: e.name, emoji: e.emoji };
    f.menu = null;
    f.selector = null;
    broadcast();
  });
  socket.on('host:flow:end', () => asHost(() => { room.flow = initFlow(); broadcast(); }));
}
