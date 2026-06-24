// 라이어게임 UI — 참가자(비밀 역할/투표/결과) + 진행자 컨트롤.
(function () {
  const { socket, $, esc } = window.App;
  const me = () => window.App.getMyName();
  let mine = null;   // liar:you 로 받은 내 비밀 (role/keyword/category/isLiar)

  socket.on('liar:you', (p) => { mine = p; renderPlayerLiar(); });

  window.renderLiar = (room) => {
    if (!room.liar) mine = null;
    else if (!mine && room.liar.participants.includes(me())) socket.emit('liar:whoami');
    renderHostLiar(room);
    lastLiar = room.liar; lastCats = room.liarCategories || [];
    renderPlayerLiar();
  };
  let lastLiar = null, lastCats = [];

  // ---- 참가자 ----
  function renderPlayerLiar() {
    const el = $('pLiar'); if (!el) return;
    const s = lastLiar, name = me();
    if (!s) { el.classList.add('hidden'); el.innerHTML = ''; return; }
    el.classList.remove('hidden');
    if (!s.participants.includes(name)) { el.innerHTML = `<h2>🤥 라이어게임</h2><p class="muted">관전 중 (${esc(s.category)})</p>`; return; }

    if (s.phase === 'result') { el.innerHTML = resultHtml(s); return; }
    if (s.phase === 'vote') {
      const voted = s.voted.includes(name);
      el.innerHTML = `<h2>🔍 라이어는 누구?</h2>
        ${voted ? '<p class="muted">투표 완료 ✓ 결과를 기다려요</p>' : `<div class="pick-grid">${
          s.participants.filter((p) => p !== name).map((p) => `<button class="btn pick" data-act="lvote" data-name="${esc(p)}">${esc(p)}</button>`).join('')}</div>`}`;
      bind(el); return;
    }
    // describe
    const card = mine
      ? (mine.isLiar
        ? `<div class="liar-card liar"><div class="role">😈 당신은 라이어!</div>
             <div class="liar-cat">카테고리: <b>${esc(mine.category)}</b></div>
             <div class="ment">제시어를 몰라요. 들키지 않게 아는 척! 🤫</div></div>`
        : `<div class="liar-card citizen"><div class="role">🙂 시민</div>
             <div class="liar-cat">카테고리: ${esc(mine.category)}</div>
             <div class="secret">${esc(mine.keyword)}</div>
             <div class="ment">제시어를 한 단어로 설명! 너무 티 나면 라이어가 따라해요</div></div>`)
      : '<p class="muted">역할 받는 중...</p>';
    el.innerHTML = `<h2>🤥 라이어게임</h2>${card}
      <div class="muted">설명 순서</div>
      <ul class="order-list">${s.order.map((n, i) => `<li><span class="no">${i + 1}</span>${esc(n)}${n === name ? ' (나)' : ''}</li>`).join('')}</ul>`;
  }

  function resultHtml(s) {
    const r = s.result;
    return `<h2>🎭 결과 공개!</h2>
      <div class="liar-reveal">라이어는 <b>${esc(r.liar)}</b></div>
      <div class="liar-word">제시어: <b>${esc(r.keyword)}</b></div>
      <div class="liar-win">${r.liarWins ? '😈 라이어 승리!' : '🎉 시민 승리!'}${r.guessUsed && r.liarWins ? ' (제시어 역전 정답)' : ''}</div>
      <div class="muted">지목: ${Object.entries(r.tally).map(([k, v]) => `${esc(k)} ${v}표`).join(' · ') || '없음'}</div>`;
  }

  // ---- 진행자 ----
  function renderHostLiar(room) {
    const el = $('hLiar'); if (!el) return;
    const s = room.liar;
    if (!s) { el.innerHTML = ''; return; } // 시작은 통합 '게임 선택'에서
    if (false) {
      el.innerHTML = `<h2>🤥 라이어게임</h2><p class="muted">한 명이 라이어! 설명 듣고 색출 (최소 3명)</p>
        <div class="pick-grid">
          <button class="btn primary" data-act="lstart">랜덤 주제</button>
          ${(room.liarCategories || []).map((c) => `<button class="btn pick" data-act="lstart" data-cat="${esc(c)}">${esc(c)}</button>`).join('')}
        </div>`;
      bind(el); return;
    }
    if (s.phase === 'describe') {
      el.innerHTML = `<h2>🤥 라이어게임 · 설명 중</h2>
        <p class="muted">주제: <b>${esc(s.category)}</b> · 순서대로 한 단어씩 설명</p>
        <ol class="order-inline">${s.order.map((n) => `<li>${esc(n)}</li>`).join('')}</ol>
        <button class="btn primary" data-act="ltovote">투표 시작 →</button>
        <button class="btn small ghost" data-act="lend">게임 종료</button>`;
    } else if (s.phase === 'vote') {
      el.innerHTML = `<h2>🗳️ 라이어 투표 중</h2>
        <div class="sq-live">투표 ${s.voteCount} / ${s.participants.length}</div>
        <button class="btn primary" data-act="lreveal">결과 공개 🎭</button>
        <button class="btn small ghost" data-act="lend">게임 종료</button>`;
    } else {
      const r = s.result;
      el.innerHTML = `<h2>🎭 결과</h2>
        <div class="liar-reveal">라이어: <b>${esc(r.liar)}</b> / 제시어: <b>${esc(r.keyword)}</b></div>
        <div class="liar-win">${r.liarWins ? '😈 라이어 승' : '🎉 시민 승'}</div>
        ${r.caught && !r.guessUsed ? `<div class="sq-row">라이어 제시어 도전:
          <button class="btn small primary" data-act="lguess" data-ok="1">정답</button>
          <button class="btn small ghost" data-act="lguess" data-ok="0">실패</button></div>` : ''}
        <p class="muted">승점은 진행자가 팀 점수 ±로 직접 주세요.</p>
        <button class="btn ghost" data-act="lend">게임 종료</button>`;
    }
    bind(el);
  }

  function bind(scope) {
    scope.querySelectorAll('[data-act]').forEach((b) => {
      if (b.dataset.b) return; b.dataset.b = '1';
      b.addEventListener('click', () => {
        const a = b.dataset.act;
        if (a === 'lstart') socket.emit('host:liar:start', b.dataset.cat ? { category: b.dataset.cat } : {});
        else if (a === 'ltovote') socket.emit('host:liar:toVote');
        else if (a === 'lreveal') socket.emit('host:liar:reveal');
        else if (a === 'lvote') socket.emit('liar:vote', { target: b.dataset.name });
        else if (a === 'lguess') socket.emit('host:liar:guess', { success: b.dataset.ok === '1' });
        else if (a === 'lend') socket.emit('host:liar:end');
      });
    });
  }
})();
