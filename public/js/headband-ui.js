// 양세찬 게임(헤드밴드) UI — 참가자 선택·단어풀 선택 + 개인 비밀 분배(자기 단어만 숨김).
(function () {
  const { socket, $, esc } = window.App;
  const me = () => window.App.getMyName();
  let mine = null;       // headband:you 로 받은 내 화면 데이터
  let draft = { participants: new Set(), sourceId: null }; // 진행자 setup 임시 상태
  let lastRoom = null;

  socket.on('headband:you', (p) => { mine = p; renderPlayer(); });

  window.renderHeadband = (room) => {
    lastRoom = room;
    if (!room.headband) mine = null; // 끝나면 비밀 비움
    else if (!mine && room.headband.participants?.includes(me())) socket.emit('headband:whoami');
    renderHost(room);
    renderPlayer();
  };

  // ---- 진행자 ----
  function renderHost(room) {
    const el = $('hHeadband'); if (!el) return;
    const s = room.headband;
    if (!s) {
      if (window.App.anyGameActive(room)) { el.innerHTML = ''; return; }
      el.innerHTML = setupHtml(room);
      bindSetup(el, room);
      return;
    }
    // 진행 중 — 정답 목록 + 공개·승팀·종료
    const rows = s.participants.map((n) => {
      const word = s.answers ? s.answers[n] : '???';
      return `<div class="hb-row"><b>${esc(n)}</b><span>${esc(word)}</span></div>`;
    }).join('');
    el.innerHTML = `<h2>🎤 양세찬 게임 (${esc(s.sourceName)})</h2>
      <p class="muted">각자 머리 위 단어를 남이 보고 힌트를 줘요. 자기 단어만 모름!</p>
      <div class="hb-list">${rows}</div>
      ${s.revealed ? `<div class="rule-win">${winLabel(s.lastWin)}</div>` : '<button class="btn small ghost" data-act="hbreveal">정답 공개 (전원)</button>'}
      <div class="sq-row">승팀 기록:</div>
      <div class="win-grid">
        <button class="btn" data-act="hbwin" data-team="A">A팀 승</button>
        <button class="btn" data-act="hbwin" data-team="B">B팀 승</button>
        <button class="btn ghost" data-act="hbwin" data-team="draw">무승부</button>
      </div>
      <button class="btn small ghost" data-act="hbend">게임 종료</button>`;
    bindRunning(el);
  }

  function setupHtml(room) {
    const sources = room.headbandSources || [];
    const sourceId = draft.sourceId || sources[0]?.id;
    const players = (room.players || []).filter((p) => p.connected);
    const chips = players.map((p) => {
      const on = draft.participants.has(p.name);
      return `<button class="btn chip-pick ${on ? 'primary' : 'ghost'}" data-name="${esc(p.name)}">${esc(p.name)}${on ? ' ✓' : ''}</button>`;
    }).join('');
    const srcBtns = sources.map((s) =>
      `<button class="btn ${sourceId === s.id ? 'primary' : 'ghost'} small" data-src="${esc(s.id)}">${esc(s.emoji)} ${esc(s.name)}</button>`).join('');
    const n = draft.participants.size;
    return `<h2>🎤 양세찬 게임 시작</h2>
      <p class="muted">참가자 선택 + 어떤 풀에서 단어를 따올지 골라요</p>
      <div class="hb-section">참가자 (${n}명 선택)</div>
      <div class="hb-chips">${chips}</div>
      <div class="hb-section">단어 풀</div>
      <div class="hb-chips">${srcBtns}</div>
      <button class="btn primary" data-act="hbstart" ${n < 2 ? 'disabled' : ''}>▶ 시작 (${n}명)</button>`;
  }

  // ---- 참가자 ----
  function renderPlayer() {
    const el = $('pHeadband'); if (!el) return;
    const s = lastRoom?.headband;
    if (!s) { el.classList.add('hidden'); el.innerHTML = ''; return; }
    el.classList.remove('hidden');
    if (!mine) { el.innerHTML = `<h2>🎤 양세찬 게임</h2><p class="muted">단어 받는 중...</p>`; return; }
    const youHeader = mine.isParticipant
      ? `<div class="hb-mine">🙈 내 단어 (나만 모름)<div class="hb-mine-q">???</div></div>`
      : `<div class="hb-mine muted">관전 중 (참가자 아님)</div>`;
    const list = mine.participants.map((n) => {
      const w = mine.visible[n];
      const isMe = n === me();
      return `<div class="hb-row ${isMe ? 'hb-self' : ''}"><b>${esc(n)}${isMe ? ' (나)' : ''}</b><span>${w ? esc(w) : '???'}</span></div>`;
    }).join('');
    el.innerHTML = `<h2>🎤 양세찬 게임 · ${esc(mine.sourceName)}</h2>
      ${youHeader}
      <div class="hb-section">남들 단어 (질문해서 내 단어 추리!)</div>
      <div class="hb-list">${list}</div>`;
  }

  const winLabel = (w) => w === 'draw' ? '무승부' : w === 'A' ? 'A팀 승!' : w === 'B' ? 'B팀 승!' : '';

  function bindSetup(scope, room) {
    scope.querySelectorAll('.chip-pick').forEach((b) => {
      b.onclick = () => { const n = b.dataset.name; if (draft.participants.has(n)) draft.participants.delete(n); else draft.participants.add(n); renderHost(room); };
    });
    scope.querySelectorAll('[data-src]').forEach((b) => {
      b.onclick = () => { draft.sourceId = b.dataset.src; renderHost(room); };
    });
    const start = scope.querySelector('[data-act="hbstart"]');
    if (start) start.onclick = () => {
      if (draft.participants.size < 2) return;
      const sourceId = draft.sourceId || (room.headbandSources?.[0]?.id);
      socket.emit('host:headband:start', { participants: [...draft.participants], sourceId });
      draft = { participants: new Set(), sourceId: null };
    };
  }
  function bindRunning(scope) {
    scope.querySelectorAll('[data-act]').forEach((b) => {
      if (b.dataset.b) return; b.dataset.b = '1';
      b.addEventListener('click', () => {
        const a = b.dataset.act;
        if (a === 'hbreveal') socket.emit('host:headband:reveal');
        else if (a === 'hbwin') socket.emit('host:headband:win', { team: b.dataset.team });
        else if (a === 'hbend') socket.emit('host:headband:end');
      });
    });
  }
})();
