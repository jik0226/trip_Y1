// 팀전 토너먼트 상태 기계.
// 3타임 진행 → 각 타임 진 팀이 항목(벌칙) 담당 → 타임 사이 1:1 팀원 교환.
import { TEAM_CONFIG, CHORES } from './teams.js';

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

export function initTournament() {
  return { active: false };
}

// 팀 구성을 깊은 복사해서 새 토너먼트 시작.
export function startTournament() {
  return {
    active: true,
    timeIndex: 0,
    totalTimes: CHORES.length,
    phase: 'playing', // playing | swapPrompt | swap | done
    teamScore: { A: 0, B: 0 },
    teams: {
      A: { ...TEAM_CONFIG.A, members: [...TEAM_CONFIG.A.members] },
      B: { ...TEAM_CONFIG.B, members: [...TEAM_CONFIG.B.members] },
    },
    results: [],   // [{ chore, loser, scoreA, scoreB }]
    swap: null,    // { method, picks?, votes? }
    lastSwap: null,
  };
}

export function teamOf(t, name) {
  if (!t?.active) return null;
  if (t.teams.A.members.includes(name)) return 'A';
  if (t.teams.B.members.includes(name)) return 'B';
  return null;
}

export function addTeamScore(t, team, delta) {
  if (!t.active || t.phase !== 'playing') return;
  if (team !== 'A' && team !== 'B') return;
  t.teamScore[team] = Math.max(0, t.teamScore[team] + (Number(delta) || 0));
}

// 현재 타임 종료 → 진 팀 결정. 동점이면 거부.
export function endTime(t) {
  if (!t.active || t.phase !== 'playing') return { error: '진행 중인 타임이 없어요.' };
  const { A, B } = t.teamScore;
  if (A === B) return { error: '동점이에요! 점수를 조정하거나 한 게임 더 진행하세요.' };
  const loser = A < B ? 'A' : 'B';
  t.results.push({
    chore: CHORES[t.timeIndex], loser, scoreA: A, scoreB: B,
    loserName: t.teams[loser].name, loserMembers: [...t.teams[loser].members],
  });
  if (t.timeIndex >= t.totalTimes - 1) {
    t.phase = 'done';
  } else {
    t.phase = 'swapPrompt';
  }
  return { ok: true };
}

// 교환 방법 선택.
export function startSwap(t, method) {
  if (!t.active || t.phase !== 'swapPrompt') return { error: '교환 단계가 아니에요.' };
  if (!['random', 'leader', 'vote'].includes(method)) return { error: '알 수 없는 방법.' };
  t.phase = 'swap';
  t.swap = { method, picks: { A: null, B: null }, votes: { A: {}, B: {} } };
  if (method === 'random') return resolveSwap(t);
  return { ok: true };
}

// 팀장 지정: 상대 팀 일반 팀원 1명을 데려온다.
export function leaderPick(t, leaderName, targetName) {
  if (t.phase !== 'swap' || t.swap.method !== 'leader') return { error: '지정 단계가 아니에요.' };
  const myTeam = teamOf(t, leaderName);
  if (!myTeam || t.teams[myTeam].leader !== leaderName) return { error: '팀장만 지정할 수 있어요.' };
  const opp = myTeam === 'A' ? 'B' : 'A';
  if (!t.teams[opp].members.includes(targetName)) return { error: '상대 팀에서만 데려올 수 있어요.' };
  t.swap.picks[myTeam] = targetName; // myTeam이 데려올 사람(상대 소속, 팀장 포함)
  if (t.swap.picks.A && t.swap.picks.B) return resolveSwap(t);
  return { ok: true };
}

// 다수결: 자기 팀에서 "보낼 사람"에게 투표.
export function castVote(t, voterName, targetName) {
  if (t.phase !== 'swap' || t.swap.method !== 'vote') return { error: '투표 단계가 아니에요.' };
  const team = teamOf(t, voterName);
  if (!team) return { error: '팀원이 아니에요.' };
  if (!t.teams[team].members.includes(targetName)) return { error: '같은 팀원에게만 투표할 수 있어요.' };
  t.swap.votes[team][voterName] = targetName; // 팀장 포함, 자기 자신도 가능
  // 양 팀 모두 전원 투표 완료 시 자동 집계
  const allVoted = ['A', 'B'].every((tm) => t.teams[tm].members.every((m) => t.swap.votes[tm][m]));
  if (allVoted) return resolveSwap(t);
  return { ok: true };
}

// 집계가 안 끝나도 진행자가 강제 마감 — 누락된 픽은 랜덤으로 채워 4:4 깨짐 방지.
export function forceResolve(t) {
  if (t.phase !== 'swap') return { error: '교환 단계가 아니에요.' };
  if (t.swap.method === 'leader') {
    if (!t.swap.picks.A) t.swap.picks.A = pick(t.teams.B.members); // A가 데려올 사람(B 소속)
    if (!t.swap.picks.B) t.swap.picks.B = pick(t.teams.A.members);
  }
  return resolveSwap(t);
}

function tallyVote(t, team) {
  const counts = {};
  for (const target of Object.values(t.swap.votes[team])) counts[target] = (counts[target] || 0) + 1;
  const max = Math.max(0, ...Object.values(counts));
  const top = Object.keys(counts).filter((k) => counts[k] === max);
  return top.length ? pick(top) : pick(t.teams[team].members);
}

// 실제 1:1 교환 수행 후 다음 타임으로.
function resolveSwap(t) {
  let aOut, bOut; // aOut: A→B 이동, bOut: B→A 이동
  if (t.swap.method === 'random') {
    aOut = pick(t.teams.A.members);
    bOut = pick(t.teams.B.members);
  } else if (t.swap.method === 'leader') {
    // picks[A]는 A가 데려올 사람(B 소속) → B→A 이동, picks[B]는 A→B 이동
    bOut = t.swap.picks.A;
    aOut = t.swap.picks.B;
  } else { // vote: 각 팀이 보낼 사람
    aOut = tallyVote(t, 'A');
    bOut = tallyVote(t, 'B');
  }
  t.teams.A.members = t.teams.A.members.filter((m) => m !== aOut).concat(bOut);
  t.teams.B.members = t.teams.B.members.filter((m) => m !== bOut).concat(aOut);
  // 팀장이 교환되면 그 팀에 새로 들어온 사람이 새 팀장이 됨 (각 팀 팀장 1명 유지).
  const leaderChange = {};
  if (aOut === t.teams.A.leader) { t.teams.A.leader = bOut; leaderChange.A = bOut; }
  if (bOut === t.teams.B.leader) { t.teams.B.leader = aOut; leaderChange.B = aOut; }
  t.lastSwap = { method: t.swap.method, AtoB: aOut, BtoA: bOut, leaderChange };
  t.swap = null;
  t.timeIndex += 1;
  t.teamScore = { A: 0, B: 0 };
  t.phase = 'playing';
  return { ok: true, swapped: t.lastSwap };
}

// 진행자 수동 컨트롤: 팀원을 다른 팀으로 이동.
export function movePlayer(t, name, toTeam) {
  if (!t.active || (toTeam !== 'A' && toTeam !== 'B')) return { error: '이동 불가.' };
  const from = teamOf(t, name);
  if (!from || from === toTeam) return { error: '이미 그 팀이거나 명단에 없어요.' };
  t.teams[from].members = t.teams[from].members.filter((m) => m !== name);
  t.teams[toTeam].members.push(name);
  // 팀장이 빠졌으면 남은 첫 멤버를 임시 팀장으로 (진행자가 다시 지정 가능).
  if (t.teams[from].leader === name) t.teams[from].leader = t.teams[from].members[0] || null;
  return { ok: true };
}

// 진행자 수동 컨트롤: 특정 팀원을 그 팀의 팀장으로 지정.
export function setLeader(t, name) {
  if (!t.active) return { error: '팀전 중이 아니에요.' };
  const team = teamOf(t, name);
  if (!team) return { error: '명단에 없어요.' };
  t.teams[team].leader = name;
  return { ok: true };
}

// 소켓 핸들러 등록 (server.js connection 안에서 호출).
export function registerTournament(socket, { room, broadcast, asHost, relay }) {
  socket.on('host:startTournament', () => asHost(() => { room.tournament = startTournament(); broadcast(); }));
  socket.on('host:teamScore', ({ team, delta }) => asHost(() => { addTeamScore(room.tournament, team, delta); broadcast(); }));
  socket.on('host:endTime', () => asHost(() => relay(endTime(room.tournament))));
  socket.on('host:startSwap', ({ method }) => asHost(() => relay(startSwap(room.tournament, method))));
  socket.on('host:forceSwap', () => asHost(() => relay(forceResolve(room.tournament))));
  socket.on('host:endTournament', () => asHost(() => { room.tournament = initTournament(); broadcast(); }));
  socket.on('host:movePlayer', ({ name, toTeam }) => asHost(() => relay(movePlayer(room.tournament, name, toTeam))));
  socket.on('host:setLeader', ({ name }) => asHost(() => relay(setLeader(room.tournament, name))));
  // 팀장 지정 / 다수결 투표 — 참가자 본인 소켓에서 발생
  socket.on('leader:pick', ({ target }) => { if (socket.data.name) relay(leaderPick(room.tournament, socket.data.name, target)); });
  socket.on('swap:vote', ({ target }) => { if (socket.data.name) relay(castVote(room.tournament, socket.data.name, target)); });
}

// 클라이언트로 보낼 공개 상태.
export function tournamentPublic(t) {
  if (!t.active) return null;
  const base = {
    timeIndex: t.timeIndex,
    totalTimes: t.totalTimes,
    chore: CHORES[t.timeIndex] || null,
    chores: CHORES,
    phase: t.phase,
    teamScore: t.teamScore,
    teams: t.teams,
    results: t.results,
    lastSwap: t.lastSwap,
  };
  if (t.phase === 'swap') {
    base.swap = {
      method: t.swap.method,
      picks: t.swap.picks,
      voteCount: { A: Object.keys(t.swap.votes.A).length, B: Object.keys(t.swap.votes.B).length },
    };
  }
  return base;
}
