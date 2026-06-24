// 오디오 게임(1초노래·절대음감·랜덤플레이댄스) — 진행자 폰에서 유튜브 재생.
// videoId/제목은 진행자에게만(audio:song), 참가자는 듣고 맞히기. 세트 후 승팀 +1 승점.
import { AUDIO_MODES, SONGS } from './songgames.js';
import { addTeamScore } from './tournament.js';

const shuffle = (arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
};

export function initAudio() { return { active: false }; }
export const audioModes = () => Object.entries(AUDIO_MODES).map(([id, m]) => ({ id, label: m.label, emoji: m.emoji }));

export function audioPublic(s) {
  if (!s?.active) return null;
  const song = s.songs[s.idx];
  const showTitle = s.revealed || !s.mode.hideTitle;
  return {
    modeKey: s.modeKey, label: s.mode.label, emoji: s.mode.emoji,
    idx: s.idx, total: s.songs.length, score: s.score, revealed: s.revealed, winner: s.winner,
    title: showTitle && song ? song.title : null, // videoId는 절대 공개 안 함
  };
}

export function registerAudio(socket, { io, room, broadcast, asHost, endOtherGames }) {
  const sendSong = () => { // 진행자에게만 현재 곡(videoId/start/sec) 전송
    const s = room.audio;
    if (!s.active || room.hostId == null) return;
    const song = s.songs[s.idx];
    io.to(room.hostId).emit('audio:song', song
      ? { videoId: song.videoId, title: song.title, start: song.start || 0, sec: s.mode.sec } : null);
  };

  socket.on('host:audio:start', ({ modeKey }) => asHost(() => {
    const mode = AUDIO_MODES[modeKey];
    if (!mode) return io.to(socket.id).emit('host:error', '없는 모드예요.');
    endOtherGames?.('audio');
    room.audio = { active: true, modeKey, mode, songs: shuffle(SONGS), idx: 0, score: { A: 0, B: 0 }, revealed: false, winner: null };
    broadcast(); sendSong();
  }));
  socket.on('host:audio:reveal', () => asHost(() => { if (room.audio.active) { room.audio.revealed = true; broadcast(); } }));
  socket.on('host:audio:award', ({ team }) => asHost(() => {
    const s = room.audio;
    if (!s.active || s.idx >= s.songs.length) return;
    if (team === 'A' || team === 'B') s.score[team] += 1;
    s.idx += 1; s.revealed = false; broadcast(); sendSong();
  }));
  socket.on('host:audio:skip', () => asHost(() => {
    const s = room.audio;
    if (!s.active || s.idx >= s.songs.length) return;
    s.idx += 1; s.revealed = false; broadcast(); sendSong();
  }));
  socket.on('host:audio:finish', () => asHost(() => {
    const s = room.audio;
    if (!s.active || s.winner) return;
    s.winner = s.score.A === s.score.B ? 'draw' : (s.score.A > s.score.B ? 'A' : 'B');
    if (s.winner !== 'draw' && room.tournament.active) addTeamScore(room.tournament, s.winner, 1);
    broadcast();
  }));
  socket.on('host:audio:end', () => asHost(() => { room.audio = initAudio(); broadcast(); }));
}
