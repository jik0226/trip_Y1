// 룰 카드 게임 UI — 모두에게 규칙만 띄우고, 진행자는 승팀만 기록(→승점).
(function () {
  const { socket, $, esc } = window.App;
  const winLabel = (w) => (w === 'draw' ? '무승부' : w === 'A' ? 'A팀 승!' : w === 'B' ? 'B팀 승!' : '');

  window.renderSimple = (room) => {
    renderHost(room);
    renderPlayer(room.simple);
  };

  function ruleCard(s) {
    return `<div class="rule-card">
      <div class="rule-title">${esc(s.emoji)} ${esc(s.name)}</div>
      <div class="rule-body">${esc(s.rule)}</div>
      <div class="rule-score">🏆 ${esc(s.scoring)}</div>
      ${s.lastWin ? `<div class="rule-win">${esc(winLabel(s.lastWin))}</div>` : ''}
    </div>`;
  }

  // ---- 참가자: 규칙만 본다 ----
  function renderPlayer(s) {
    const el = $('pSimple'); if (!el) return;
    if (!s) { el.classList.add('hidden'); el.innerHTML = ''; return; }
    el.classList.remove('hidden');
    el.innerHTML = `<h2>📋 게임 규칙</h2>${ruleCard(s)}
      <p class="muted">대면으로 승부! 결과는 진행자가 기록해요.</p>`;
  }

  // ---- 진행자: 게임 고르고 승팀 기록 ----
  function renderHost(room) {
    const el = $('hSimple'); if (!el) return;
    const s = room.simple;
    if (!s) {
      el.innerHTML = `<h2>📋 룰 카드 게임 (대면 진행)</h2>
        <p class="muted">규칙만 띄우고 승부는 직접 — 이긴 팀만 누르면 승점 +1</p>
        <div class="game-grid">${(room.simpleGames || []).map((g) => `
          <div class="game-btn" data-act="sstart" data-id="${g.id}">
            <div class="emoji">${esc(g.emoji)}</div><div class="gname">${esc(g.name)}</div>
            <div class="gdesc">키워드: ${esc(g.keyword)}</div></div>`).join('')}</div>`;
      bind(el); return;
    }
    el.innerHTML = `${ruleCard(s)}
      <div class="sq-row">승팀 기록 (승점 +1):</div>
      <div class="win-grid">
        <button class="btn" data-act="swin" data-team="A">A팀 승</button>
        <button class="btn" data-act="swin" data-team="B">B팀 승</button>
        <button class="btn ghost" data-act="swin" data-team="draw">무승부</button>
      </div>
      <button class="btn small ghost" data-act="send">게임 종료</button>`;
    bind(el);
  }

  function bind(scope) {
    scope.querySelectorAll('[data-act]').forEach((b) => {
      if (b.dataset.b) return; b.dataset.b = '1';
      b.addEventListener('click', () => {
        const a = b.dataset.act;
        if (a === 'sstart') socket.emit('host:simple:start', { id: b.dataset.id });
        else if (a === 'swin') socket.emit('host:simple:win', { team: b.dataset.team });
        else if (a === 'send') socket.emit('host:simple:end');
      });
    });
  }
})();
