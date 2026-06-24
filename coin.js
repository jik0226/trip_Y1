// 동전 던지기 / 둘 중 랜덤 추첨 — 모든 폰에 동시에 같은 결과를 띄운다.
// 선공 팀 정하기, 선/후공, 앞/뒤 등 "둘 중 하나"를 공정하게 결정.
export function initCoin() { return null; }

export function registerCoin(socket, { room, broadcast, asHost }) {
  socket.on('host:coin:flip', ({ title, options } = {}) => asHost(() => {
    const opts = (Array.isArray(options) && options.length === 2) ? options.map(String) : ['A팀', 'B팀'];
    room.coin = {
      id: (room.coin?.id || 0) + 1,        // 증가하는 id로 클라이언트가 새 애니메이션 트리거
      title: String(title || '동전 던지기'),
      options: opts,
      result: Math.floor(Math.random() * 2), // 0 | 1
    };
    broadcast();
  }));
  socket.on('host:coin:clear', () => asHost(() => { room.coin = null; broadcast(); }));
}
