// 스피드 퀴즈 UI — variant.presenters에 따라 출제자 1명 또는 2명(번갈아) 처리.
// 1명: 출제자 본인이 정답/패스. 2명: 출제자는 입모양 전달, 같은 팀 누구나 정답/패스.
(function () {
  const { socket, $, esc } = window.App;
  const me = () => window.App.getMyName();
  let myWord = null;
  let lastSQ = null;
  let lastTeams = null;
  const fmt = (ms) => Math.ceil(ms / 1000) + '초';
  const presArr = (s, team) => Array.isArray(s.presenter?.[team]) ? s.presenter[team] : (s.presenter?.[team] ? [s.presenter[team]] : []);
  const currentPresenter = (s) => presArr(s, s.currentTeam)[s.curIdx || 0] || null;

  socket.on('sq:word', (p) => { myWord = p?.word || null; renderPlayerSQ(); });

  window.renderSpeedQuiz = (room) => {
    lastSQ = room.speedquiz;
    lastTeams = room.tournament?.teams || null;
    renderHostSQ(room);
    renderPlayerSQ();
  };

  setInterval(() => {
    document.querySelectorAll('.js-sqtimer').forEach((el) => {
      const end = Number(el.dataset.end);
      el.textContent = end ? fmt(Math.max(0, end - Date.now())) : '--';
    });
  }, 250);

  function renderHostSQ(room) {
    const el = $('hSpeedQuiz'); if (!el) return;
    const s = room.speedquiz;
    if (!s) { el.innerHTML = ''; return; }
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
    const cap = s.variant.presenters || 1;
    const members = (room.players || []).filter((p) => p.team === team).map((p) => p.name);
    const first = s.phase === 'setup'
      ? `<div class="sq-row">선공: <button class="btn small ${s.firstTeam === 'A' ? 'primary' : 'ghost'}" data-act="sqfirst" data-team="A">A팀</button>
         <button class="btn small ${s.firstTeam === 'B' ? 'primary' : 'ghost'}" data-act="sqfirst" data-team="B">B팀</button></div>` : '';
    if (!s.firstTeam) return first;
    const chosen = presArr(s, team);
    const label = chosen.length ? chosen.join(' · ') : '미정';
    const ready = chosen.length === cap;
    const pres = `
      <div class="sq-row">${esc(team)}팀 출제자 (${chosen.length}/${cap}): <b>${esc(label)}</b></div>
      <div class="pick-grid">${members.length ? members.map((m) => `
        <button class="btn pick ${chosen.includes(m) ? 'primary' : ''}" data-act="sqpres" data-team="${team}" data-name="${esc(m)}">${esc(m)}${chosen.includes(m) ? ' ✓' : ''}</button>`).join('')
        : '<span class="muted">팀전을 시작해 팀을 구성하세요</span>'}</div>
      <button class="btn primary" data-act="sqbegin" ${ready ? '' : 'disabled'}>▶ ${esc(team)}팀 라운드 시작 (${s.duration}초)</button>`;
    return first + pres;
  }

  function hostPlaying(s) {
    const cap = s.variant.presenters || 1;
    const cur = currentPresenter(s);
    const turnLine = cap > 1 ? ` (${(s.curIdx || 0) + 1}/${cap})` : '';
    return `<div class="sq-live">
      <div>${esc(s.currentTeam)}팀 · 출제자 <b>${esc(cur || '')}</b>${turnLine}</div>
      <div class="sq-timer js-sqtimer" data-end="${s.roundEndsAt || 0}">--</div>
      <div>맞춘 수: <b>${s.count[s.currentTeam]}</b></div></div>
      <button class="btn ghost" data-act="sqendround">라운드 강제 종료</button>`;
  }

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
    const cap = s.variant.presenters || 1;
    const cur = currentPresenter(s);
    const amPresenter = s.phase === 'playing' && presArr(s, s.currentTeam).includes(name);
    const myTurn = amPresenter && cur === name;

    // 출제자 본인 화면
    if (amPresenter) {
      const otherPresenter = presArr(s, s.currentTeam).find((n) => n !== name);
      const body = myTurn
        ? `<div class="sq-word">${myWord ? esc(myWord) : '...'}</div>
           <div class="muted">입모양으로 팀원에게 전달!</div>`
        : `<div class="sq-watch">⏸ 대기 — <b>${esc(otherPresenter || '')}</b> 차례</div>`;
      const judge = cap === 1
        ? `<div class="sq-btns">
            <button class="btn pass" data-act="sqpass">패스 ⏭</button>
            <button class="btn correct" data-act="sqcorrect">정답! ✅</button>
          </div>` : '<p class="muted">정답/패스는 나머지 팀원이 눌러요</p>';
      el.innerHTML = `<div class="sq-presenter">
        <div class="muted">${esc(s.variant.conveyance)}</div>
        ${body}
        <div class="sq-pcount">맞춘 수 ${s.count[s.currentTeam]} · <span class="sq-timer js-sqtimer" data-end="${s.roundEndsAt || 0}">--</span></div>
        ${judge}</div>`;
      bind(el); return;
    }

    const mine = lastTeams ? (lastTeams.A.members.includes(name) ? 'A' : lastTeams.B.members.includes(name) ? 'B' : null) : null;
    const inCurrentTeam = mine && mine === s.currentTeam;
    // presenters>1이면서 currentTeam의 비출제자 팀원 → 정답/패스 버튼
    const canJudge = s.phase === 'playing' && cap > 1 && inCurrentTeam;
    const turn = s.phase === 'playing'
      ? (inCurrentTeam ? '🙉 우리 차례! 맞혀라!' : `${esc(s.currentTeam || '')}팀 차례 (관전)`)
      : '곧 시작! 진행자가 출제자 지정 중...';
    el.innerHTML = `<h2>${esc(s.variant.emoji)} ${esc(s.variant.name)}</h2>
      <div class="sq-watch">${turn}</div>
      ${s.phase === 'playing' ? `<div class="muted">출제자: <b>${esc(cur || '')}</b>${cap > 1 ? ' (' + ((s.curIdx || 0) + 1) + '/' + cap + ')' : ''}</div>` : ''}
      ${s.phase === 'playing' ? `<div class="sq-pcount">맞춘 수 ${s.count[s.currentTeam]} · <span class="sq-timer js-sqtimer" data-end="${s.roundEndsAt || 0}">--</span></div>` : ''}
      ${canJudge ? `<div class="sq-btns">
        <button class="btn pass" data-act="sqpass">패스 ⏭</button>
        <button class="btn correct" data-act="sqcorrect">정답! ✅</button>
      </div>` : ''}
      <div class="sq-score"><span class="team-A">A ${s.count.A}</span> : <span class="team-B">B ${s.count.B}</span></div>`;
    bind(el);
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
