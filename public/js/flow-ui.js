// 키워드 게임 뽑기 UI — 진행자 컨트롤 + 선택팀 팀장의 추상 키워드 그리드 + 전원 공개.
(function () {
  const { socket, $, esc } = window.App;
  const me = () => window.App.getMyName();
  let lastLeaders = null;

  window.renderFlow = (room) => {
    lastLeaders = room.leaders || null;
    renderHost(room);
    renderPlayer(room.flow);
  };

  const revealHtml = (lp) => lp
    ? `<div class="flow-reveal">🎲 <span class="kw">${esc(lp.keyword)}</span> → <b>${esc(lp.emoji)} ${esc(lp.name)}</b></div>` : '';

  // ---- 진행자 ----
  function renderHost(room) {
    const el = $('hFlow'); if (!el) return;
    const f = room.flow;
    if (!f) {
      el.innerHTML = `<h2>🎲 키워드 게임 뽑기</h2>
        <p class="muted">진 팀 팀장이 추상 키워드로 다음 게임을 뽑아요 (정체는 뽑기 전까지 비밀)</p>
        <button class="btn primary" data-act="fstart">게임 뽑기 시작</button>`;
      bind(el); return;
    }
    let body = `<h2>🎲 게임 뽑기 (${f.playedCount}/${f.total} 진행)</h2>${revealHtml(f.lastPick)}`;
    if (f.selector && f.menu) {
      body += `<div class="muted"><b>${esc(f.selector)}팀</b> 팀장이 키워드 고르는 중...</div>`;
    } else {
      body += `<div class="sq-row">누구에게 선택권을 줄까요?</div>
        <div class="coin-btns">
          <button class="btn primary" data-act="fcoin">🪙 동전 추첨</button>
          <button class="btn" data-act="fsel" data-team="A">A팀에게</button>
          <button class="btn" data-act="fsel" data-team="B">B팀에게</button>
        </div>
        ${f.lastPick ? '<p class="muted">위 게임을 아래 컨트롤로 진행하세요. 끝나면 진 팀에게 선택권을!</p>' : ''}`;
    }
    body += `<button class="btn small ghost" data-act="fend">뽑기 종료</button>`;
    el.innerHTML = body;
    bind(el);
  }

  // ---- 참가자 ----
  function renderPlayer(f) {
    const el = $('pFlow'); if (!el) return;
    if (!f) { el.classList.add('hidden'); el.innerHTML = ''; return; }
    el.classList.remove('hidden');
    const name = me();
    const iAmSelectorLeader = f.selector && lastLeaders && lastLeaders[f.selector] === name && f.menu;
    if (iAmSelectorLeader) {
      el.innerHTML = `<h2>🎲 게임을 뽑아라!</h2>
        <p class="muted">키워드만 보고 골라요 — 무슨 게임일지는 비밀 😼</p>
        <div class="kw-grid">${f.menu.map((k) => `<button class="btn kw-card" data-act="fpick" data-kw="${esc(k)}">${esc(k)}</button>`).join('')}</div>`;
      bind(el); return;
    }
    if (f.selector && f.menu) {
      el.innerHTML = `<h2>🎲 게임 뽑는 중</h2><div class="flow-wait">${esc(f.selector)}팀 팀장이 키워드를 고르고 있어요...</div>`;
      return;
    }
    el.innerHTML = `<h2>🎲 게임 뽑기</h2>${f.lastPick ? revealHtml(f.lastPick) : '<div class="flow-wait">진행자가 선택권을 정하는 중...</div>'}`;
  }

  function bind(scope) {
    scope.querySelectorAll('[data-act]').forEach((b) => {
      if (b.dataset.b) return; b.dataset.b = '1';
      b.addEventListener('click', () => {
        const a = b.dataset.act;
        if (a === 'fstart') socket.emit('host:flow:start');
        else if (a === 'fcoin') socket.emit('host:flow:coinSelector');
        else if (a === 'fsel') socket.emit('host:flow:selector', { team: b.dataset.team });
        else if (a === 'fpick') socket.emit('flow:pick', { keyword: b.dataset.kw });
        else if (a === 'fend') socket.emit('host:flow:end');
      });
    });
  }
})();
