// 오디오 게임 — 진행자 폰에서 유튜브 IFrame으로 재생, 곡 정체는 진행자만.
//
// ⚠️ videoId 솔직 고지: 학습 데이터로 추정한 ID라 일부 안 먹을 수 있어요(영상 삭제·지역 차단·잘못된 매칭).
//    실제 사용 전 진행자 폰에서 한 번씩 ▶ 재생 확인해보고, 안 되면 "🔎 유튜브 검색" 버튼으로 직접 트세요.
//    유튜브 URL이 https://youtu.be/ABC123 또는 watch?v=ABC123 이면 videoId는 "ABC123".

export const AUDIO_MODES = {
  song1s: { label: '1초 듣고 노래 맞히기', emoji: '🎧', sec: 1, hideTitle: true },
  pitch: { label: '절대음감 (3초)', emoji: '🎵', sec: 3, hideTitle: true },
  randomdance: { label: '랜덤 플레이 댄스', emoji: '💃', sec: 30, hideTitle: false },
};

// 곡 풀. title은 진행자/공개시 표시, videoId는 진행자에게만 전송.
// start = 후렴 또는 인트로 직전 위치(초). 1초 게임은 후렴 시작점이 좋음.
export const SONGS = [
  // K-pop 메가히트
  { title: 'BTS - Dynamite', videoId: 'gdZLi9oWNZg', start: 41 },
  { title: 'BTS - Butter', videoId: 'WMweEpGlu_U', start: 60 },
  { title: 'NewJeans - Hype Boy', videoId: 'AVRYg5HXxxc', start: 22 },
  { title: 'NewJeans - Super Shy', videoId: 'ArmDp-zijuc', start: 32 },
  { title: 'IVE - Love Dive', videoId: 'Y8JFxS1HlDo', start: 50 },
  { title: 'IVE - I AM', videoId: '6ZUIwj3FgUY', start: 56 },
  { title: 'aespa - Next Level', videoId: '4TWR90KJl84', start: 60 },
  { title: 'BLACKPINK - DDU-DU DDU-DU', videoId: 'IHNzOHi8sJs', start: 60 },
  { title: 'BLACKPINK - How You Like That', videoId: 'ioNng23DkIM', start: 60 },
  { title: 'TWICE - TT', videoId: 'ePpPVE-GGJw', start: 65 },
  { title: 'PSY - 강남스타일', videoId: '9bZkp7q19f0', start: 56 },
  { title: 'BIGBANG - 뱅뱅뱅', videoId: '2ips2mM7Zqw', start: 30 },
  { title: '아이유 - 좋은 날', videoId: 'jeqdYqsrsA0', start: 55 },
  { title: '아이유 - Blueming', videoId: 'D1PvIWdJ8xo', start: 40 },
  { title: 'LE SSERAFIM - ANTIFRAGILE', videoId: 'WfvxA0ekHkk', start: 33 },
  { title: 'NewJeans - OMG', videoId: 'Mlz4VYW_cWA', start: 48 },
  { title: 'BTS - Boy With Luv', videoId: 'XsX3ATc3FbA', start: 60 },
  { title: 'aespa - Spicy', videoId: 'BD2QmwoQwlc', start: 50 },
  { title: 'IVE - After LIKE', videoId: 'F0B7HDiY-10', start: 55 },
  { title: 'BLACKPINK - Pink Venom', videoId: 'gQlMMD8auMs', start: 50 },
];
