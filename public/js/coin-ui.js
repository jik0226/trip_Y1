// 동전 던지기 UI — 새 플립이 오면 모든 폰에 풀스크린 동전 애니메이션을 띄우고 결과를 공개.
(function () {
  const { socket, $, esc } = window.App;
  let lastId = 0;

  window.renderCoin = (room) => {
    renderHost(room);
    const c = room.coin;
    if (c && c.id !== lastId) { lastId = c.id; playFlip(c); }
  };

  // 풀스크린 오버레이: 동전 회전 → 결과 공개
  function playFlip(c) {
    const el = $('coinOverlay'); if (!el) return;
    const winner = c.options[c.result];
    el.classList.remove('hidden');
    el.innerHTML = `<div class="coin-box">
      <div class="coin-title">${esc(c.title)}</div>
      <div class="coin spinning">🪙</div>
      <div class="coin-opts">${c.options.map((o, i) => `<span class="copt o${i}">${esc(o)}</span>`).join('<span class="vs">vs</span>')}</div>
      <div class="coin-result"></div>
    </div>`;
    setTimeout(() => {
      el.querySelector('.coin')?.classList.remove('spinning');
      const r = el.querySelector('.coin-result');
      if (r) r.innerHTML = `🎉 <b>${esc(winner)}</b>`;
      el.querySelectorAll('.copt')[c.result]?.classList.add('won');
    }, 1300);
    clearTimeout(playFlip._t);
    playFlip._t = setTimeout(() => el.classList.add('hidden'), 5000);
    el.onclick = () => el.classList.add('hidden'); // 탭하면 닫기
  }

  // 진행자 컨트롤
  function renderHost(room) {
    const el = $('hCoin'); if (!el) return;
    const last = room.coin ? `<div class="muted">최근: ${esc(room.coin.title)} → <b>${esc(room.coin.options[room.coin.result])}</b></div>` : '';
    el.innerHTML = `<h2>🪙 동전 던지기 (전원 화면)</h2>
      <div class="coin-btns">
        <button class="btn primary" data-act="flip" data-t="선공 팀 정하기" data-o="A팀,B팀">선공 팀 (A/B)</button>
        <button class="btn" data-act="flip" data-t="선/후공" data-o="선공,후공">선 / 후</button>
        <button class="btn" data-act="flip" data-t="동전" data-o="앞,뒤">앞 / 뒤</button>
      </div>${last}`;
    bind(el);
  }

  function bind(scope) {
    scope.querySelectorAll('[data-act="flip"]').forEach((b) => {
      if (b.dataset.b) return; b.dataset.b = '1';
      b.addEventListener('click', () => socket.emit('host:coin:flip', { title: b.dataset.t, options: b.dataset.o.split(',') }));
    });
  }
})();
