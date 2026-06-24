// 이어말하기/외치기 UI — 주제/끝글자(랜덤) 전원 표시 + 진행자 새주제·승팀 기록.
(function () {
  const { socket, $, esc } = window.App;
  const winLabel = (w) => (w === 'draw' ? '무승부' : w === 'A' ? 'A팀 승!' : w === 'B' ? 'B팀 승!' : '');

  window.renderWord = (room) => { renderHost(room); renderPlayer(room.word); };

  function promptCard(s) {
    return `<div class="rule-card">
      <div class="rule-title">${esc(s.emoji)} ${esc(s.name)}</div>
      <div class="word-prompt">${esc(s.prompt)}</div>
      <div class="rule-body">${esc(s.rule)}</div>
      ${s.lastWin ? `<div class="rule-win">${esc(winLabel(s.lastWin))}</div>` : ''}
    </div>`;
  }

  function renderPlayer(s) {
    const el = $('pWord'); if (!el) return;
    if (!s) { el.classList.add('hidden'); el.innerHTML = ''; return; }
    el.classList.remove('hidden');
    el.innerHTML = `<h2>🗣️ 이어말하기</h2>${promptCard(s)}<p class="muted">대면으로! 결과는 진행자가 기록해요.</p>`;
  }

  function renderHost(room) {
    const el = $('hWord'); if (!el) return;
    const s = room.word;
    if (!s && window.App.anyGameActive(room)) { el.innerHTML = ''; return; }
    if (!s) {
      el.innerHTML = `<h2>🗣️ 이어말하기 / 외치기</h2>
        <p class="muted">랜덤 주제만 띄우고 승부는 대면 — 승팀만 누르면 승점 +1</p>
        <div class="game-grid">${(room.wordGames || []).map((g) => `
          <div class="game-btn" data-act="wstart" data-id="${g.id}">
            <div class="emoji">${esc(g.emoji)}</div><div class="gname">${esc(g.name)}</div></div>`).join('')}</div>`;
      bind(el); return;
    }
    el.innerHTML = `${promptCard(s)}
      <button class="btn" data-act="wroll">🎲 새 주제</button>
      <div class="sq-row">승팀 기록 (승점 +1):</div>
      <div class="win-grid">
        <button class="btn" data-act="wwin" data-team="A">A팀 승</button>
        <button class="btn" data-act="wwin" data-team="B">B팀 승</button>
        <button class="btn ghost" data-act="wwin" data-team="draw">무승부</button>
      </div>
      <button class="btn small ghost" data-act="wend">게임 종료</button>`;
    bind(el);
  }

  function bind(scope) {
    scope.querySelectorAll('[data-act]').forEach((b) => {
      if (b.dataset.b) return; b.dataset.b = '1';
      b.addEventListener('click', () => {
        const a = b.dataset.act;
        if (a === 'wstart') socket.emit('host:word:start', { id: b.dataset.id });
        else if (a === 'wroll') socket.emit('host:word:roll');
        else if (a === 'wwin') socket.emit('host:word:win', { team: b.dataset.team });
        else if (a === 'wend') socket.emit('host:word:end');
      });
    });
  }
})();
