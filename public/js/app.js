// Client: pick your name, see your private mission, optionally run the host panel.
const socket = io();
const $ = (id) => document.getElementById(id);
const screens = { home: $('home'), player: $('player'), host: $('host') };

let myName = null;   // 내가 고른 이름 (플레이어로 입장한 경우)
let isHost = false;  // 이 폰이 진행자 컨트롤 화면을 켰는지
let lastRoom = null;

// 브라우저별 고유 ID — 같은 폰의 새로고침/재접속은 허용, 다른 사람의 도용은 차단.
const clientId = (() => {
  let id = localStorage.getItem('clientId');
  if (!id) { id = 'c-' + Math.random().toString(36).slice(2) + Date.now().toString(36); localStorage.setItem('clientId', id); }
  return id;
})();

const show = (name) => { for (const k in screens) screens[k].classList.toggle('active', k === name); };

// 게임 모듈들과 공유할 참조. anyGameActive: 어떤 게임이라도 진행 중인지(진행자 화면 정리용).
window.App = {
  socket, $, esc, getMyName: () => myName,
  anyGameActive: (room) => !!(room.speedquiz || room.liar || room.simple || room.word || room.quiz || room.audio),
};

// ---- 입장 동작 -----------------------------------------------------------
function claim(name) {
  socket.emit('claim', { name, clientId }, (res) => {
    if (!res?.ok) {
      $('homeError').textContent = res?.error || '입장 실패';
      sessionStorage.removeItem('myName');
      return;
    }
    myName = name;
    sessionStorage.setItem('myName', name);
    isHost = false;
    show('player');
  });
}

$('toHostBtn').onclick = () => socket.emit('becomeHost', null, (res) => {
  if (res?.ok) { isHost = true; updateHostBack(); show('host'); }
});
$('backToPlayerBtn').onclick = () => show('player');
$('leaveBtn').onclick = () => { sessionStorage.removeItem('myName'); myName = null; show('home'); };
$('hResetBtn').onclick = () => { if (confirm('모든 점수를 0으로 초기화할까요?')) socket.emit('host:resetScores'); };

const updateHostBack = () => $('backToPlayerBtn').classList.toggle('hidden', !myName);

// 새로고침 시 자동 재입장
window.addEventListener('load', () => {
  const saved = sessionStorage.getItem('myName');
  if (saved) claim(saved);
});

// ---- 서버 이벤트 ----------------------------------------------------------
socket.on('room:update', (room) => {
  lastRoom = room;
  renderHome(room);
  if (screens.player.classList.contains('active')) renderPlayer(room);
  if (screens.host.classList.contains('active')) renderHost(room);
  window.renderTournament?.(room);
  window.renderSpeedQuiz?.(room);
  window.renderLiar?.(room);
  window.renderSimple?.(room);
  window.renderCoin?.(room);
  window.renderFlow?.(room);
  window.renderWord?.(room);
  window.renderQuiz?.(room);
  window.renderAudio?.(room);
});
socket.on('host:error', (m) => { $('hError').textContent = m; setTimeout(() => ($('hError').textContent = ''), 4000); });
socket.on('bumped', () => { alert('다른 기기에서 같은 이름으로 접속했어요.'); sessionStorage.removeItem('myName'); location.reload(); });

// ---- 홈: 이름 카드 --------------------------------------------------------
function renderHome(room) {
  $('nameGrid').innerHTML = room.players.map((p) => `
    <button class="name-card ${p.connected ? 'taken' : ''}" data-name="${esc(p.name)}">
      <span class="nm">${esc(p.name)}</span>
      <span class="st">${p.connected ? '접속중' : '비어있음'}</span>
    </button>`).join('');
  $('nameGrid').querySelectorAll('.name-card').forEach((b) => {
    b.onclick = () => { $('homeError').textContent = ''; claim(b.dataset.name); };
  });
}

// ---- 참가자 ---------------------------------------------------------------
function renderPlayer(room) {
  const me = room.players.find((p) => p.name === myName);
  if (me) {
    const iAmHost = room.hostName === myName;
    const iAmLeader = room.leaders && (room.leaders.A === myName || room.leaders.B === myName);
    $('pMe').textContent = `${me.name}${iAmHost ? ' · 진행자 🎮' : iAmLeader ? ' · 팀장 👑' : ''}`;
    $('pName').textContent = me.name;
    $('pTeam').textContent = me.team || '미정';
    $('pScore').textContent = me.score;
    // 진행자 컨트롤 버튼은 기본 진행자(인겸)에게만 노출.
    $('toHostBtn').classList.toggle('hidden', myName !== room.defaultHost);
  }
  $('pPlayers').innerHTML = room.players.map(playerRow).join('');
}

function playerRow(p) {
  return `<li>
    <span class="dot ${p.connected ? '' : 'off'}"></span>
    <span class="pname">${esc(p.name)}</span>
    ${p.team ? `<span class="pteam">${esc(p.team)}</span>` : ''}
    <span class="pscore">${p.score}</span>
  </li>`;
}

// ---- 진행자 ---------------------------------------------------------------
function renderHost(room) {
  $('hPlayers').innerHTML = room.players.map((p) => `
    <li data-id="${esc(p.name)}">
      <span class="dot ${p.connected ? '' : 'off'}"></span>
      <span class="pname">${esc(p.name)}</span>
      <span class="score-ctrl">
        <button data-act="minus">−</button>
        <span class="pscore">${p.score}</span>
        <button data-act="plus">＋</button>
      </span>
    </li>`).join('');
  $('hPlayers').querySelectorAll('li').forEach((li) => {
    const id = li.dataset.id;
    li.querySelector('[data-act="plus"]').onclick = () => socket.emit('host:addScore', { playerId: id, delta: 1 });
    li.querySelector('[data-act="minus"]').onclick = () => socket.emit('host:addScore', { playerId: id, delta: -1 });
  });
  updateHostBack();
}

// ---- util -----------------------------------------------------------------
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
