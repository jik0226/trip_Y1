// Game definitions. Add a new game = add one entry here; the engine wires the rest.
//
// Each game exposes assign(participants, config) and returns:
//   {
//     public:    state every phone can see (shown in the shared room view),
//     perPlayer: { [playerId]: { title, ment, secret?, role } }  // private per phone
//     host:      info only the host sees (answers, judging notes)
//   }
// participants: [{ id, name, team, score }]

const shuffle = (arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

const SCREAM_WORDS = [
  '김치찌개', '제육볶음', '마라탕', '탕수육', '곱창전골', '붕어빵', '슬리퍼',
  '에어컨', '돌고래', '코끼리', '선풍기', '비빔밥', '롤러코스터', '해바라기',
  '고슴도치', '카푸치노', '낙지볶음', '딸기우유', '주먹밥', '미끄럼틀',
];

export const GAMES = {
  silent_scream: {
    id: 'silent_scream',
    name: '고요 속의 외침',
    emoji: '🗣️',
    desc: '헤드셋 끼고 입모양만 보고 단어 전달하기',
    minPlayers: 2,
    assign(participants, config) {
      const order = shuffle(participants);
      const word = (config.word && config.word.trim()) || pick(SCREAM_WORDS);
      const perPlayer = {};
      order.forEach((p, i) => {
        const isFirst = i === 0;
        const isLast = i === order.length - 1;
        if (isFirst) {
          perPlayer[p.id] = {
            role: '출제자', title: `1번 · 출제자`,
            secret: word,
            ment: '이 단어를 입모양으로만! 소리 내면 반칙이에요 🤫 다음 사람한테 전달!',
          };
        } else if (isLast) {
          perPlayer[p.id] = {
            role: '정답자', title: `${i + 1}번 · 마지막 정답자`,
            ment: '대망의 마지막! 앞사람 입모양 보고 정답을 외쳐요 🔊',
          };
        } else {
          perPlayer[p.id] = {
            role: '전달자', title: `${i + 1}번 · 전달자`,
            ment: '앞사람 입모양 잘 보고, 본 그대로 다음 사람에게 전달!',
          };
        }
      });
      return {
        public: {
          headline: '🎧 헤드셋(또는 귀막고 큰 노래) 준비!',
          order: order.map((p, i) => ({ no: i + 1, name: p.name })),
          rule: '1번이 입모양으로 단어를 전달 → 마지막 사람이 정답을 외칩니다.',
        },
        perPlayer,
        host: { answer: word, order: order.map((p) => p.name) },
      };
    },
  },
};
