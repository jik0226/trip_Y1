// 퀴즈 UI — 문제는 전원, 정답은 진행자에게만(quiz:answer). 진행자가 팀별 정답 판정·점수.
(function () {
  const { socket, $, esc } = window.App;
  let hostAnswer = null; // 진행자에게만 오는 현재 정답

  socket.on('quiz:answer', (p) => { hostAnswer = p?.answer || null; });

  window.renderQuiz = (room) => { renderHost(room); renderPlayer(room.quiz); };

  const scoreLine = (s) => `<div class="sq-score"><span class="team-A">A ${s.score.A}</span> : <span class="team-B">B ${s.score.B}</span></div>`;

  function renderPlayer(s) {
    const el = $('pQuiz'); if (!el) return;
    if (!s) { el.classList.add('hidden'); el.innerHTML = ''; return; }
    el.classList.remove('hidden');
    if (s.winner) {
      el.innerHTML = `<h2>🏁 ${esc(s.category)} 퀴즈 끝!</h2>${scoreLine(s)}
        <div class="sq-winner">${s.winner === 'draw' ? '무승부!' : `${s.winner}팀 승!`}</div>`;
      return;
    }
    const done = s.idx >= s.total;
    el.innerHTML = `<h2>❓ ${esc(s.category)} 퀴즈 <span class="muted">(${Math.min(s.idx + 1, s.total)}/${s.total})</span></h2>
      ${done ? '<div class="quiz-q">문제 끝! 결과 집계 중...</div>'
        : `<div class="quiz-q">${esc(s.question)}</div>`}
      ${s.revealed && s.answer ? `<div class="quiz-a">정답: <b>${esc(s.answer)}</b></div>` : ''}
      ${scoreLine(s)}`;
  }

  function renderHost(room) {
    const el = $('hQuiz'); if (!el) return;
    const s = room.quiz;
    if (!s) { el.innerHTML = ''; return; } // 시작은 통합 '게임 선택'에서
    if (false) {
      el.innerHTML = `<h2>❓ 퀴즈</h2><p class="muted">문제는 전원 화면, 정답은 진행자만 — 맞힌 팀 눌러요</p>
        <div class="coin-btns">${(room.quizCategories || []).map((c) => `
          <button class="btn primary" data-act="qstart" data-cat="${esc(c)}">${esc(c)}</button>`).join('')}</div>`;
      bind(el); return;
    }
    if (s.winner) {
      el.innerHTML = `<h2>🏁 결과</h2>${scoreLine(s)}
        <div class="sq-winner">${s.winner === 'draw' ? '무승부' : `${s.winner}팀 승! (+1 승점)`}</div>
        <button class="btn ghost" data-act="qend">퀴즈 종료</button>`;
      bind(el); return;
    }
    const done = s.idx >= s.total;
    el.innerHTML = `<h2>❓ ${esc(s.category)} (${Math.min(s.idx + 1, s.total)}/${s.total})</h2>
      ${done ? '<div class="quiz-q">문제 모두 출제 완료!</div>'
        : `<div class="quiz-q">${esc(s.question)}</div>
           <div class="quiz-a">정답(진행자만): <b>${esc(hostAnswer || '...')}</b></div>`}
      ${scoreLine(s)}
      ${done ? `<button class="btn primary" data-act="qfinish">결과 보기 🏆</button>`
        : `<div class="win-grid">
            <button class="btn" data-act="qaward" data-team="A">A팀 정답</button>
            <button class="btn" data-act="qaward" data-team="B">B팀 정답</button>
            <button class="btn ghost" data-act="qskip">아무도 (패스)</button>
          </div>
          <button class="btn small ghost" data-act="qreveal">정답 공개(전원)</button>
          <button class="btn small primary" data-act="qfinish">여기서 결과 보기</button>`}
      <button class="btn small ghost" data-act="qend">퀴즈 종료</button>`;
    bind(el);
  }

  function bind(scope) {
    scope.querySelectorAll('[data-act]').forEach((b) => {
      if (b.dataset.b) return; b.dataset.b = '1';
      b.addEventListener('click', () => {
        const a = b.dataset.act;
        if (a === 'qstart') socket.emit('host:quiz:start', { category: b.dataset.cat });
        else if (a === 'qreveal') socket.emit('host:quiz:reveal');
        else if (a === 'qaward') socket.emit('host:quiz:award', { team: b.dataset.team });
        else if (a === 'qskip') socket.emit('host:quiz:skip');
        else if (a === 'qfinish') socket.emit('host:quiz:finish');
        else if (a === 'qend') socket.emit('host:quiz:end');
      });
    });
  }
})();
