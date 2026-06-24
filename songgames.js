// 오디오 게임 — 진행자 폰에서 유튜브 IFrame으로 재생, 곡 정체는 진행자만 본다.
//
// ⚠️ videoId는 실제 유튜브 영상 ID로 채워야 재생됩니다 (예시값은 비어 있음).
//    유튜브 URL이 https://youtu.be/ABC123 또는 watch?v=ABC123 이면 videoId는 "ABC123".
//    start = 재생 시작 초(후렴 시작 지점 등). 친구들이 다 아는 곡으로 미리 채워두세요.

export const AUDIO_MODES = {
  song1s: { label: '1초 듣고 노래 맞히기', emoji: '🎧', sec: 1, hideTitle: true },
  pitch: { label: '절대음감 (3초)', emoji: '🎵', sec: 3, hideTitle: true },
  randomdance: { label: '랜덤 플레이 댄스', emoji: '💃', sec: 30, hideTitle: false },
};

// 곡 풀 (공용). title은 진행자/공개시에만, videoId는 진행자에게만 전송.
export const SONGS = [
  { title: '예시: 곡명 - 가수', videoId: '', start: 30 },
  { title: '예시2: 곡명 - 가수', videoId: '', start: 0 },
  // ↑ 실제 곡으로 교체/추가하세요. videoId 빈 항목은 재생되지 않습니다.
];
