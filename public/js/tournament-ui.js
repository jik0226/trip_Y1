// 팀전 토너먼트 UI — 진행자 패널(#hTournament)과 참가자 카드(#pTournament)를 그린다.
// app.js가 노출한 window.App.{socket,$,esc,getMyName}를 사용.
(function () {
  const { socket, $, esc } = window.App;
  const me = () => window.App.getMyName();
  const METHODS = { random: '🎲 랜덤', leader: '👑 팀장 지정', vote: '🗳️ 다수결' };

  const teamOf = (t, name) =>
    t.teams.A.members.includes(name) ? 'A' : t.teams.B.members.includes(name) ? 'B' : null;
  const isLeader = (t, name) => name && (t.teams.A.leader === name || t.teams.B.leader === name);

  const resultsHtml = (t) =>
    t.results.length
      ? `<div class="tour-results"><h3>지금까지 결정</h3>${t.results.map((r) =>
          `<div class="res-row"><span>${esc(r.chore)}</span><b class="loser">${esc(r.loserName)} (${esc(r.loserMembers.join('·'))})</b></div>`).join('')}</div>`
      : '';

  const leaderNote = (s) => {
    const c = s.leaderChange || {};
    const parts = [];
    if (c.A) parts.push(`A팀 새 팀장 👑 ${esc(c.A)}`);
    if (c.B) parts.push(`B팀 새 팀장 👑 ${esc(c.B)}`);
    return parts.length ? `<div class="leader-note">${parts.join(' · ')}</div>` : '';
  };
  const swapBanner = (t) =>
    t.lastSwap
      ? `<div class="swap-banner">🔄 교환 완료 — <b>${esc(t.lastSwap.AtoB)}</b> ↔ <b>${esc(t.lastSwap.BtoA)}</b> (${METHODS[t.lastSwap.method]})${leaderNote(t.lastSwap)}</div>`
      : '';

  window.renderTournament = (room) => {
    renderHost(room.tournament);
    renderPlayer(room.tournament);
  };

  // ---------------- 진행자 패널 ----------------
  function renderHost(t) {
    const el = $('hTournament');
    if (!el) return;
    if (!t) {
      el.innerHTML = `<h2>🏆 4:4 팀전</h2><p class="muted">진 팀이 항목을 맡는 3타임 팀전이에요.</p>
        <button class="btn primary" data-act="startTour">팀전 시작</button>`;
      bind(el);
      return;
    }
    const timeLabel = `타임 ${t.timeIndex + 1} / ${t.totalTimes}`;
    if (t.phase === 'playing') {
      el.innerHTML = `<h2>🏆 팀전 · ${timeLabel}</h2>
        <div class="chore-head">이번 타임 벌칙: <b>${esc(t.chore)}</b></div>
        ${swapBanner(t)}
        ${['A', 'B'].map((k) => teamScoreBlock(t, k)).join('')}
        <button class="btn primary" data-act="endTime">이 타임 종료 (진 팀 = 벌칙)</button>
        ${resultsHtml(t)}
        <button class="btn small ghost" data-act="endTour">팀전 취소</button>`;
    } else if (t.phase === 'swapPrompt') {
      el.innerHTML = `<h2>🔄 팀원 바꾸기 찬스!</h2>
        <p class="muted">1:1 교환 방법을 고르세요. (팀장도 교환 대상! 🔥)</p>
        <div class="method-grid">
          <button class="btn primary" data-act="swap" data-m="random">🎲 랜덤</button>
          <button class="btn primary" data-act="swap" data-m="leader">👑 팀장 지정</button>
          <button class="btn primary" data-act="swap" data-m="vote">🗳️ 다수결</button>
        </div>${resultsHtml(t)}`;
    } else if (t.phase === 'swap') {
      el.innerHTML = `<h2>🔄 교환 진행 중 — ${METHODS[t.swap.method]}</h2>
        ${swapProgress(t)}
        <button class="btn ghost" data-act="forceSwap">지금 마감하고 교환</button>`;
    } else if (t.phase === 'done') {
      el.innerHTML = `<h2>🎉 팀전 종료!</h2>
        <div class="tour-results final">${t.results.map((r) =>
          `<div class="res-row"><span>${esc(r.chore)}</span><b class="loser">${esc(r.loserName)} (${esc(r.loserMembers.join('·'))})</b></div>`).join('')}</div>
        <button class="btn ghost" data-act="endTour">새 팀전 (초기화)</button>`;
    }
    bind(el);
  }

  function teamScoreBlock(t, k) {
    const team = t.teams[k];
    const other = k === 'A' ? 'B' : 'A';
    return `<div class="team-block team-${k}">
      <div class="team-top"><b>${esc(team.name)}</b><span class="team-score">${t.teamScore[k]}</span></div>
      <div class="member-edit">${team.members.map((m) => `
        <div class="medit-row">
          <span class="mname">${esc(m)}${m === team.leader ? ' 👑' : ''}</span>
          <span class="mbtns">
            ${m === team.leader ? '' : `<button data-act="setLeader" data-name="${esc(m)}">팀장</button>`}
            <button data-act="move" data-name="${esc(m)}" data-to="${other}">→${other}</button>
          </span>
        </div>`).join('')}</div>
      <div class="score-ctrl">
        <button data-act="ts" data-team="${k}" data-d="-1">−</button>
        <button data-act="ts" data-team="${k}" data-d="1">＋ 점수</button>
      </div></div>`;
  }

  function swapProgress(t) {
    if (t.swap.method === 'leader') {
      return `<p class="muted">팀장이 상대 팀에서 데려올 사람을 지정하는 중...</p>
        <div class="res-row"><span>A팀장</span><b>${t.swap.picks.A ? esc(t.swap.picks.A) + ' 지목' : '대기'}</b></div>
        <div class="res-row"><span>B팀장</span><b>${t.swap.picks.B ? esc(t.swap.picks.B) + ' 지목' : '대기'}</b></div>`;
    }
    if (t.swap.method === 'vote') {
      return `<p class="muted">각 팀원이 "보낼 사람"에게 투표하는 중...</p>
        <div class="res-row"><span>A팀 투표</span><b>${t.swap.voteCount.A} / 4</b></div>
        <div class="res-row"><span>B팀 투표</span><b>${t.swap.voteCount.B} / 4</b></div>`;
    }
    return `<p class="muted">랜덤 추첨 중...</p>`;
  }

  // ---------------- 참가자 카드 ----------------
  function renderPlayer(t) {
    const el = $('pTournament');
    if (!el) return;
    const name = me();
    if (!t || !name) { el.classList.add('hidden'); el.innerHTML = ''; return; }
    el.classList.remove('hidden');
    const myTeam = teamOf(t, name);
    const teamTag = myTeam ? `<span class="team-tag team-${myTeam}">${esc(t.teams[myTeam].name)}${isLeader(t, name) ? ' 팀장 👑' : ''}</span>` : '';

    if (t.phase === 'done') {
      el.innerHTML = `<h2>🎉 팀전 결과</h2>${teamTag}
        ${t.results.map((r) => `<div class="res-row"><span>${esc(r.chore)}</span><b class="loser">${esc(r.loserName)}</b></div>`).join('')}`;
      return;
    }

    let body = `<h2>🏆 팀전 · 타임 ${t.timeIndex + 1}/${t.totalTimes}</h2>${teamTag}
      <div class="chore-head">벌칙: <b>${esc(t.chore)}</b></div>
      <div class="team-scores"><span class="team-A">A ${t.teamScore.A}</span> : <span class="team-B">B ${t.teamScore.B}</span></div>
      ${swapBanner(t)}`;

    if (t.phase === 'swap') body += swapAction(t, name, myTeam);
    el.innerHTML = body;
    bind(el);
  }

  // 참가자가 직접 조작하는 교환 UI
  function swapAction(t, name, myTeam) {
    if (!myTeam) return '';
    if (t.swap.method === 'leader') {
      if (!isLeader(t, name)) return `<p class="muted">팀장이 교환 대상을 지정하는 중...</p>`;
      if (t.swap.picks[myTeam]) return `<p class="muted">지목 완료: <b>${esc(t.swap.picks[myTeam])}</b></p>`;
      const opp = myTeam === 'A' ? 'B' : 'A';
      const cands = t.teams[opp].members; // 팀장 포함
      return `<p class="swap-q">상대 팀에서 데려올 사람을 골라요 👇 (팀장도 OK)</p>
        <div class="pick-grid">${cands.map((c) => `<button class="btn pick" data-act="pick" data-target="${esc(c)}">${esc(c)}</button>`).join('')}</div>`;
    }
    if (t.swap.method === 'vote') {
      const cands = t.teams[myTeam].members; // 팀장 포함 (팀장 추방 가능)
      return `<p class="swap-q">우리 팀에서 상대로 "보낼 사람"에 투표 🗳️ (팀장도 가능!)</p>
        <div class="pick-grid">${cands.map((c) => `<button class="btn pick" data-act="vote" data-target="${esc(c)}">${esc(c)}</button>`).join('')}</div>`;
    }
    return `<p class="muted">🎲 랜덤 교환 중...</p>`;
  }

  // ---------------- 이벤트 바인딩 ----------------
  function bind(scope) {
    scope.querySelectorAll('[data-act]').forEach((b) => {
      if (b.dataset.bound) return;
      b.dataset.bound = '1';
      b.addEventListener('click', () => {
        const a = b.dataset.act;
        if (a === 'startTour') socket.emit('host:startTournament');
        else if (a === 'ts') socket.emit('host:teamScore', { team: b.dataset.team, delta: Number(b.dataset.d) });
        else if (a === 'endTime') socket.emit('host:endTime');
        else if (a === 'swap') socket.emit('host:startSwap', { method: b.dataset.m });
        else if (a === 'forceSwap') socket.emit('host:forceSwap');
        else if (a === 'endTour') { if (confirm('팀전을 초기화할까요?')) socket.emit('host:endTournament'); }
        else if (a === 'pick') socket.emit('leader:pick', { target: b.dataset.target });
        else if (a === 'vote') socket.emit('swap:vote', { target: b.dataset.target });
        else if (a === 'move') socket.emit('host:movePlayer', { name: b.dataset.name, toTeam: b.dataset.to });
        else if (a === 'setLeader') socket.emit('host:setLeader', { name: b.dataset.name });
      });
    });
  }
})();
