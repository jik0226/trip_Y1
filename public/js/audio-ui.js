// 오디오 게임 UI — 진행자 폰에서 유튜브 IFrame으로 곡 재생(스니펫), 참가자는 듣고 맞히기.
(function () {
  const { socket, $, esc } = window.App;
  let ytPlayer = null, ytReady = false, currentSong = null;

  // 유튜브 IFrame API 로드(한 번) + 고정 플레이어 div (재렌더에 영향 안 받게 body에 둠)
  function loadYT() {
    if (window.YT && window.YT.Player) return initPlayer();
    if (!document.getElementById('yt-api')) {
      const tag = document.createElement('script');
      tag.id = 'yt-api'; tag.src = 'https://www.youtube.com/iframe_api';
      document.head.appendChild(tag);
    }
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => { if (prev) prev(); initPlayer(); };
  }
  function initPlayer() {
    if (ytPlayer) return;
    let host = document.getElementById('ytHost');
    if (!host) { host = document.createElement('div'); host.id = 'ytHost'; host.style.cssText = 'position:fixed;left:-9999px;top:0'; document.body.appendChild(host); }
    ytPlayer = new YT.Player('ytHost', { height: '1', width: '1', videoId: '', events: { onReady: () => { ytReady = true; } } });
  }
  loadYT();

  socket.on('audio:song', (s) => { currentSong = s; });

  function play() {
    if (!(ytReady && ytPlayer && currentSong && currentSong.videoId)) return;
    ytPlayer.loadVideoById({ videoId: currentSong.videoId, startSeconds: currentSong.start || 0 });
    clearTimeout(play._t);
    play._t = setTimeout(() => { try { ytPlayer.pauseVideo(); } catch (e) {} }, (currentSong.sec || 1) * 1000);
  }
  function stop() { try { if (ytPlayer) ytPlayer.pauseVideo(); } catch (e) {} }

  const scoreLine = (s) => `<div class="sq-score"><span class="team-A">A ${s.score.A}</span> : <span class="team-B">B ${s.score.B}</span></div>`;

  window.renderAudio = (room) => { renderHost(room); renderPlayer(room.audio); };

  function renderPlayer(s) {
    const el = $('pAudio'); if (!el) return;
    if (!s) { el.classList.add('hidden'); el.innerHTML = ''; return; }
    el.classList.remove('hidden');
    if (s.winner) {
      el.innerHTML = `<h2>🏁 ${esc(s.label)} 끝!</h2>${scoreLine(s)}<div class="sq-winner">${s.winner === 'draw' ? '무승부!' : `${s.winner}팀 승!`}</div>`;
      return;
    }
    el.innerHTML = `<h2>${esc(s.emoji)} ${esc(s.label)} <span class="muted">(${Math.min(s.idx + 1, s.total)}/${s.total})</span></h2>
      <div class="quiz-q">🔊 진행자 폰에서 재생돼요 — 잘 듣고 맞혀요!</div>
      ${s.title ? `<div class="quiz-a">정답: <b>${esc(s.title)}</b></div>` : ''}
      ${scoreLine(s)}`;
  }

  function renderHost(room) {
    const el = $('hAudio'); if (!el) return;
    const s = room.audio;
    if (!s) { el.innerHTML = ''; return; } // 시작은 통합 '게임 선택'에서
    if (false) {
      el.innerHTML = `<h2>🎵 오디오 게임</h2><p class="muted">진행자 폰에서 유튜브로 재생. 곡 목록은 songgames.js에 미리 채워두세요.</p>
        <div class="coin-btns">${(room.audioModes || []).map((m) => `
          <button class="btn primary" data-act="astart" data-id="${m.id}">${esc(m.emoji)} ${esc(m.label)}</button>`).join('')}</div>`;
      bind(el); return;
    }
    if (s.winner) {
      el.innerHTML = `<h2>🏁 결과</h2>${scoreLine(s)}<div class="sq-winner">${s.winner === 'draw' ? '무승부' : `${s.winner}팀 승! (+1 승점)`}</div>
        <button class="btn ghost" data-act="aend">종료</button>`;
      bind(el); return;
    }
    const done = s.idx >= s.total;
    const noId = currentSong && !currentSong.videoId;
    el.innerHTML = `<h2>${esc(s.emoji)} ${esc(s.label)} (${Math.min(s.idx + 1, s.total)}/${s.total})</h2>
      ${done ? '<div class="quiz-q">곡 모두 재생 완료!</div>'
        : `<div class="quiz-a">현재 곡(진행자만): <b>${esc(currentSong?.title || '...')}</b></div>
           ${noId ? '<p class="error">이 곡은 videoId가 비어 있어 재생 안 돼요 (songgames.js에 채우기)</p>' : ''}
           <div class="coin-btns">
             <button class="btn primary" data-act="aplay">▶ 재생 (${s.label.includes('1초') ? '1초' : s.label.includes('3초') ? '3초' : '30초'})</button>
             <button class="btn" data-act="astop">⏹ 정지</button>
             <button class="btn small ghost" data-act="areveal">정답 공개</button>
           </div>`}
      ${scoreLine(s)}
      ${done ? '<button class="btn primary" data-act="afinish">결과 보기 🏆</button>'
        : `<div class="win-grid">
            <button class="btn" data-act="aaward" data-team="A">A팀 정답</button>
            <button class="btn" data-act="aaward" data-team="B">B팀 정답</button>
            <button class="btn ghost" data-act="askip">다음 곡</button>
          </div><button class="btn small primary" data-act="afinish">여기서 결과</button>`}
      <button class="btn small ghost" data-act="aend">종료</button>`;
    bind(el);
  }

  function bind(scope) {
    scope.querySelectorAll('[data-act]').forEach((b) => {
      if (b.dataset.b) return; b.dataset.b = '1';
      b.addEventListener('click', () => {
        const a = b.dataset.act;
        if (a === 'astart') socket.emit('host:audio:start', { modeKey: b.dataset.id });
        else if (a === 'aplay') play();
        else if (a === 'astop') stop();
        else if (a === 'areveal') socket.emit('host:audio:reveal');
        else if (a === 'aaward') { stop(); socket.emit('host:audio:award', { team: b.dataset.team }); }
        else if (a === 'askip') { stop(); socket.emit('host:audio:skip'); }
        else if (a === 'afinish') { stop(); socket.emit('host:audio:finish'); }
        else if (a === 'aend') { stop(); socket.emit('host:audio:end'); }
      });
    });
  }
})();
