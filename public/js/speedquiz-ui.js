// 출제자 스피드 퀴즈 UI — 진행자 컨트롤 + 출제자 화면(단어/정답/패스/타이머) + 관전 화면.
(function () {
  const { socket, $, esc } = window.App;
  const me = () => window.App.getMyName();
  let myWord = null;   // 출제자에게만 오는 현재 단어
  let lastSQ = null;
  let lastTeams = null;
  const fmt = (ms) => Math.ceil(ms / 1000) + '초';

  socket.on('sq:word', (p) => { myWord = p?.word || null; renderPlayerSQ(); });

  window.renderSpeedQuiz = (room) => {
    lastSQ = room.speedquiz;
    lastTeams = room.tournament?.teams || null;
    renderHostSQ(room);
    renderPlayerSQ();
  };

  // 타이머 표시 갱신 (4Hz)
  setInterval(() => {
    document.querySelectorAll('.js-sqtimer').forEach((el) => {
      const end = Number(el.dataset.end);
      el.textContent = end ? fmt(Math.max(0, end - Date.now())) : '--';
    });
  }, 250);

  // ---- 진행자 컨트롤 ----
  function renderHostSQ(room) {
    const el = $('hSpeedQuiz'); if (!el) return;
    const s = room.speedquiz;
    if (!s && window.App.anyGameActive(room)) { el.innerHTML = ''; return; }
    if (!s) {
      el.innerHTML = `<h2>🏃 스피드 퀴즈 (출제자형)</h2>
        ${room.tournament ? '' : '<p class="muted">팀전을 시작하면 팀별 출제자를 지정할 수 있어요.</p>'}
        <div class="game-grid">${(room.speedGames || []).map((g) => `
          <div class="game-btn" data-act="sqstart" data-id="${g.id}">
            <div class="emoji">${esc(g.emoji)}</div><div class="gname">${esc(g.name)}</div>
            <div class="gdesc">키워드: ${esc(g.keyword)}</div></div>`).join('')}</div>`;
      bind(el); return;
    }
    if (s.phase === 'done') {
      el.innerHTML = `<h2>🏁 ${esc(s.variant.name)} 결과</h2>
        <div class="sq-score"><span class="team-A">A ${s.count.A}</span> : <span class="team-B">B ${s.count.B}</span></div>
        <div class="sq-winner">${s.winner === 'draw' ? '무승부!' : `${s.winner}팀 승! (+1 승점)`}</div>
        <button class="btn ghost" data-act="sqend">게임 종료</button>`;
      bind(el); return;
    }
    const team = s.currentTeam || (!s.done[s.firstTeam] ? s.firstTeam : (s.firstTeam === 'A' ? 'B' : 'A'));
    el.innerHTML = `<h2>🏃 ${esc(s.variant.emoji)} ${esc(s.variant.name)}</h2>
      <p class="muted">${esc(s.variant.conveyance)}</p>
      <div class="sq-score"><span class="team-A">A ${s.count.A}${s.done.A ? ' ✓' : ''}</span> : <span class="team-B">B ${s.count.B}${s.done.B ? ' ✓' : ''}</span></div>
      ${s.phase === 'playing' ? hostPlaying(s) : hostSetup(s, room, team)}
      <button class="btn small ghost" data-act="sqend">게임 종료</button>`;
    bind(el);
  }

  function hostSetup(s, room, team) {
    const members = (room.players || []).filter((p) => p.team === team).map((p) => p.name);
    const first = s.phase === 'setup'
      ? `<div class="sq-row">선공: <button class="btn small ${s.firstTeam === 'A' ? 'primary' : 'ghost'}" data-act="sqfirst" data-team="A">A팀</button>
         <button class="btn small ${s.firstTeam === 'B' ? 'primary' : 'ghost'}" data-act="sqfirst" data-team="B">B팀</button></div>` : '';
    const pres = s.firstTeam ? `
      <div class="sq-row">${esc(team)}팀 출제자: <b>${s.presenter[team] ? esc(s.presenter[team]) : '미정'}</b></div>
      <div class="pick-grid">${members.length ? members.map((m) => `
        <button class="btn pick ${s.presenter[team] === m ? 'primary' : ''}" data-act="sqpres" data-team="${team}" data-name="${esc(m)}">${esc(m)}</button>`).join('')
        : '<span class="muted">팀전을 시작해 팀을 구성하세요</span>'}</div>
      <button class="btn primary" data-act="sqbegin" ${(!s.firstTeam || !s.presenter[team]) ? 'disabled' : ''}>▶ ${esc(team)}팀 라운드 시작 (${s.duration}초)</button>` : '';
    return first + pres;
  }

  function hostPlaying(s) {
    return `<div class="sq-live">
      <div>${esc(s.currentTeam)}팀 · 출제자 <b>${esc(s.presenter[s.currentTeam] || '')}</b></div>
      <div class="sq-timer js-sqtimer" data-end="${s.roundEndsAt || 0}">--</div>
      <div>맞춘 수: <b>${s.count[s.currentTeam]}</b></div></div>
      <button class="btn ghost" data-act="sqendround">라운드 강제 종료</button>`;
  }

  // ---- 참가자 화면 ----
  function renderPlayerSQ() {
    const el = $('pSpeedQuiz'); if (!el) return;
    const s = lastSQ, name = me();
    if (!s) { el.classList.add('hidden'); el.innerHTML = ''; return; }
    el.classList.remove('hidden');
    if (s.phase === 'done') {
      el.innerHTML = `<h2>🏁 ${esc(s.variant.name)} 끝!</h2>
        <div class="sq-score"><span class="team-A">A ${s.count.A}</span> : <span class="team-B">B ${s.count.B}</span></div>
        <div class="sq-winner">${s.winner === 'draw' ? '무승부!' : `${s.winner}팀 승!`}</div>`;
      return;
    }
    const amPresenter = s.phase === 'playing' && s.presenter[s.currentTeam] === name;
    if (amPresenter) {
      el.innerHTML = `<div class="sq-presenter">
        <div class="muted">${esc(s.variant.conveyance)}</div>
        <div class="sq-word">${myWord ? esc(myWord) : '...'}</div>
        <div class="sq-pcount">맞춘 수 ${s.count[s.currentTeam]} · <span class="sq-timer js-sqtimer" data-end="${s.roundEndsAt || 0}">--</span></div>
        <div class="sq-btns">
          <button class="btn pass" data-act="sqpass">패스 ⏭</button>
          <button class="btn correct" data-act="sqcorrect">정답! ✅</button>
        </div></div>`;
      bind(el); return;
    }
    const mine = lastTeams ? (lastTeams.A.members.includes(name) ? 'A' : lastTeams.B.members.includes(name) ? 'B' : null) : null;
    const turn = s.phase === 'playing'
      ? (mine && mine === s.currentTeam ? '🙉 우리 차례! 맞혀라!' : `${esc(s.currentTeam || '')}팀 차례 (관전)`)
      : '곧 시작! 진행자가 출제자 지정 중...';
    el.innerHTML = `<h2>${esc(s.variant.emoji)} ${esc(s.variant.name)}</h2>
      <div class="sq-watch">${turn}</div>
      ${s.phase === 'playing' ? `<div class="sq-pcount">맞춘 수 ${s.count[s.currentTeam]} · <span class="sq-timer js-sqtimer" data-end="${s.roundEndsAt || 0}">--</span></div>` : ''}
      <div class="sq-score"><span class="team-A">A ${s.count.A}</span> : <span class="team-B">B ${s.count.B}</span></div>`;
  }

  function bind(scope) {
    scope.querySelectorAll('[data-act]').forEach((b) => {
      if (b.dataset.b) return; b.dataset.b = '1';
      b.addEventListener('click', () => {
        const a = b.dataset.act;
        if (a === 'sqstart') socket.emit('host:sq:start', { variantId: b.dataset.id, duration: 60 });
        else if (a === 'sqfirst') socket.emit('host:sq:setFirst', { team: b.dataset.team });
        else if (a === 'sqpres') socket.emit('host:sq:setPresenter', { team: b.dataset.team, name: b.dataset.name });
        else if (a === 'sqbegin') socket.emit('host:sq:begin');
        else if (a === 'sqendround') socket.emit('host:sq:endRound');
        else if (a === 'sqend') socket.emit('host:sq:end');
        else if (a === 'sqcorrect') socket.emit('sq:correct');
        else if (a === 'sqpass') socket.emit('sq:pass');
      });
    });
  }
})();
