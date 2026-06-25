// 퀴즈 UI — 서바이벌 흐름. 진행자 답변자 지정 → 답변자 입력 → 자동 채점 → 맞히면 탈락.
// 정답은 reveal 누르기 전까진 진행자에게도 미공개.
(function () {
  const { socket, $, esc } = window.App;
  const me = () => window.App.getMyName();
  let lastRoom = null;

  window.renderQuiz = (room) => { lastRoom = room; renderHost(room); renderPlayer(room); };

  // ---- 공통: 살아있는 명단 칩 ----
  function aliveChips(room, q) {
    const t = room.tournament;
    if (!t) return Object.keys(q.alive).map((n) => chipHtml(q, n));
    const teamRow = (k) => `<div class="qz-team team-${k}">
      <div class="qz-team-h"><b>${esc(k)}팀</b> (${t.teams[k].members.filter(n=>q.alive[n]).length}/${t.teams[k].members.length})</div>
      <div class="hb-chips">${t.teams[k].members.map((n) => chipHtml(q, n)).join('')}</div>
    </div>`;
    return teamRow('A') + teamRow('B');
  }
  function chipHtml(q, n) {
    const dead = !q.alive[n];
    const cls = dead ? 'eliminated' : (q.assignedTo === n ? 'primary' : 'ghost');
    return `<span class="btn chip-pick ${cls}" data-name="${esc(n)}">${esc(n)}${dead ? ' ✓' : ''}</span>`;
  }

  // ---- 진행자 ----
  function renderHost(room) {
    const el = $('hQuiz'); if (!el) return;
    const q = room.quiz;
    if (!q) {
      if (window.App.anyGameActive(room)) { el.innerHTML = ''; return; }
      el.innerHTML = ''; return; // 시작은 통합 런처에서
    }
    if (q.winner) { el.innerHTML = endHtml(q); bindEnd(el); return; }
    const done = q.idx >= q.total;
    if (done) { el.innerHTML = `<h2>퀴즈 종료(문제 다 출제됨)</h2>` + endHtml(q); bindEnd(el); return; }
    const submitted = q.submitted;
    const result = submitted ? (submitted.correct ? `✅ ${esc(submitted.by)} 자동 정답!` : `❌ ${esc(submitted.by)} 자동 오답`) : '';
    const submissionLine = (q.revealedSubmission || submitted) ? `<div class="quiz-a">제출: <b>${esc(q.revealedSubmission || (q.revealedAnswer ? submitted.answer : '(제출됨)'))}</b></div>` : '';
    const answerLine = q.revealedAnswer ? `<div class="quiz-a">정답: <b class="quiz-correct">${esc(q.revealedAnswer)}</b></div>` : '';
    el.innerHTML = `<h2>❓ ${esc(q.category)} (${Math.min(q.idx + 1, q.total)}/${q.total})</h2>
      <div class="quiz-q">${esc(q.question)}</div>
      ${q.assignedTo ? `<div class="qz-status">답변자: <b>${esc(q.assignedTo)}</b>${result ? ' · ' + result : ' (입력 대기)'}</div>` : '<div class="muted">손 든 사람 지정 ↓</div>'}
      ${answerLine}${submissionLine}
      <div class="qz-section">살아있는 참가자 (탭 = 답변자 지정)</div>
      ${aliveChips(room, q)}
      <div class="win-grid">
        ${submitted ? `<button class="btn primary" data-act="qnext">다음 문제 →</button>
          ${!submitted.correct ? '<button class="btn" data-act="qforce">사실 맞음 (정답 처리)</button>' : ''}` : ''}
        ${!submitted ? '<button class="btn small ghost" data-act="qreveal">정답 공개</button>' : ''}
        <button class="btn small ghost" data-act="qend">종료</button>
      </div>`;
    bindRunning(el);
  }
  function endHtml(q) {
    const win = q.winner === 'draw' ? '무승부' : `${q.winner}팀 승! (+1 승점)`;
    const lost = q.winner === 'draw' ? '' : `<div class="muted">진 팀: ${q.winner === 'A' ? 'B' : 'A'}팀 (마지막 남은 사람들)</div>`;
    return `<h2>🏁 결과</h2><div class="sq-winner">${win}</div>${lost}
      <div class="qz-section">탈락 순서</div>
      <div class="muted">${esc(q.eliminated.join(' → ')) || '(없음)'}</div>
      <button class="btn ghost" data-act="qend">종료</button>`;
  }

  // ---- 참가자 ----
  function renderPlayer(room) {
    const el = $('pQuiz'); if (!el) return;
    const q = room.quiz;
    if (!q) { el.classList.add('hidden'); el.innerHTML = ''; return; }
    el.classList.remove('hidden');
    if (q.winner) {
      el.innerHTML = `<h2>🏁 퀴즈 끝</h2><div class="sq-winner">${q.winner === 'draw' ? '무승부!' : `${q.winner}팀 승!`}</div>`;
      return;
    }
    const myName = me();
    const iAmAssigned = q.assignedTo === myName;
    const iAmAlive = q.alive[myName];
    const submitted = q.submitted;
    const result = submitted ? (submitted.correct ? `✅ ${esc(submitted.by)} 정답!` : `❌ ${esc(submitted.by)} 오답`) : '';
    const myInput = iAmAssigned && !submitted ? `
      <div class="qz-input">
        <input id="qzInput" placeholder="답을 입력하세요" autocomplete="off" autocapitalize="off" />
        <button class="btn primary" data-act="qsubmit">제출</button>
      </div>` : '';
    el.innerHTML = `<h2>❓ ${esc(q.category)} <span class="muted">(${Math.min(q.idx + 1, q.total)}/${q.total})</span></h2>
      <div class="quiz-q">${esc(q.question)}</div>
      ${q.assignedTo
        ? `<div class="qz-status">답변자: <b>${esc(q.assignedTo)}</b>${iAmAssigned ? ' (나)' : ''} ${result ? '· ' + result : ''}</div>`
        : '<div class="muted">진행자가 답변자를 지정 중...</div>'}
      ${myInput}
      ${q.revealedAnswer ? `<div class="quiz-a">정답: <b class="quiz-correct">${esc(q.revealedAnswer)}</b></div>` : ''}
      ${q.revealedSubmission ? `<div class="quiz-a">${esc(q.assignedTo)} 제출: <b>${esc(q.revealedSubmission)}</b></div>` : ''}
      <div class="qz-section">현황 ${!iAmAlive && q.eliminated.includes(myName) ? '· 🪦 나 탈락(관전)' : ''}</div>
      ${aliveChips(room, q)}`;
    const inp = el.querySelector('#qzInput');
    if (inp) {
      inp.focus();
      inp.onkeydown = (e) => { if (e.key === 'Enter') doSubmit(inp); };
      el.querySelector('[data-act="qsubmit"]').onclick = () => doSubmit(inp);
    }
  }
  function doSubmit(inp) {
    const v = (inp?.value || '').trim();
    if (!v) return;
    socket.emit('quiz:submit', { answer: v });
    inp.value = '';
  }

  // ---- 진행자 액션 바인딩 ----
  function bindRunning(scope) {
    scope.querySelectorAll('.chip-pick').forEach((c) => {
      if (c.dataset.b) return; c.dataset.b = '1';
      c.onclick = () => {
        if (c.classList.contains('eliminated')) return;
        socket.emit('host:quiz:assign', { name: c.dataset.name });
      };
    });
    scope.querySelectorAll('[data-act]').forEach((b) => {
      if (b.dataset.b) return; b.dataset.b = '1';
      b.addEventListener('click', () => {
        const a = b.dataset.act;
        if (a === 'qnext') socket.emit('host:quiz:next');
        else if (a === 'qforce') socket.emit('host:quiz:next', { forceCorrect: true });
        else if (a === 'qreveal') socket.emit('host:quiz:reveal');
        else if (a === 'qend') socket.emit('host:quiz:end');
      });
    });
  }
  function bindEnd(scope) {
    const b = scope.querySelector('[data-act="qend"]');
    if (b) b.onclick = () => socket.emit('host:quiz:end');
  }
})();
