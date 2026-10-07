// 소원 종류 → 섬 위 요소의 자리. brain/island/elements.py를 그대로 옮긴 것 (golden에 요소 자리도 들어 있다).
// 자리 단위: 높이 지도 픽셀 (0~255), 높이는 높이 지도 값 그대로.

import { Category, categories } from "./seed.js";
import { N, SEA_LEVEL, UNITS_PER_M, hash32, voiceHash } from "./generator.js";

const STEP = 4;
const M = (meters) => SEA_LEVEL + meters * UNITS_PER_M;

function slopeMap(hm) {
  const s = new Int32Array(N * N);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const i = y * N + x;
      let v = 0;
      if (x > 0) v = Math.max(v, Math.abs(hm[i] - hm[i - 1]));
      if (x < N - 1) v = Math.max(v, Math.abs(hm[i] - hm[i + 1]));
      if (y > 0) v = Math.max(v, Math.abs(hm[i] - hm[i - N]));
      if (y < N - 1) v = Math.max(v, Math.abs(hm[i] - hm[i + N]));
      s[i] = v;
    }
  }
  return s;
}

/** 가장 가까운 물가까지 거리 (최대 40). isLand(i)가 참인 칸만 잰다. 파이썬과 같은 동시 갱신 반복. */
function coastDistance(isLand) {
  let d = new Int32Array(N * N);
  for (let i = 0; i < N * N; i++) d[i] = isLand[i] ? 40 : 0;
  for (let iter = 0; iter < 40; iter++) {
    const nb = Int32Array.from(d);
    let changed = false;
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const i = y * N + x;
        if (!isLand[i]) { nb[i] = 0; continue; }
        let v = nb[i];
        if (y > 0) v = Math.min(v, d[i - N] + 1);
        if (y < N - 1) v = Math.min(v, d[i + N] + 1);
        if (x > 0) v = Math.min(v, d[i - 1] + 1);
        if (x < N - 1) v = Math.min(v, d[i + 1] + 1);
        nb[i] = v;
        if (v !== d[i]) changed = true;
      }
    }
    if (!changed) break;
    d = nb;
  }
  return d;
}

function pick(mask, salt, k, minGap, hm, kind) {
  const cand = [];
  for (let y = 0; y < N; y += STEP) {
    for (let x = 0; x < N; x += STEP) {
      if (!mask(y * N + x)) continue;
      cand.push({ x, y, score: hash32((salt ^ (y * N + x)) >>> 0), front: y >= N / 2 ? 1 : 0 });
    }
  }
  cand.sort((a, b) => (b.front - a.front) || (b.score - a.score) || ((a.y * N + a.x) - (b.y * N + b.x)));
  const chosen = [];
  for (const c of cand) {
    if (chosen.every((e) => Math.max(Math.abs(c.x - e.x), Math.abs(c.y - e.y)) >= minGap)) {
      chosen.push({ kind, x: c.x, y: c.y, h: hm[c.y * N + c.x] });
    }
    if (chosen.length === k) break;
  }
  return chosen;
}

function pickOne(masks, salt, hm, kind) {
  for (const mask of masks) {
    const found = pick(mask, salt, 1, 1, hm, kind);
    if (found.length) return found;
  }
  return [];
}

/** 해변에서 보면 섬 옆인 세로줄: 좌우 gap 픽셀 안에 땅이 없다 (brain/island/elements.py _beside와 같다). */
function besideColumns(hm, gap) {
  const clear = new Uint8Array(N).fill(1);
  for (let x = 0; x < N; x++) {
    let land = false;
    for (let y = 0; y < N && !land; y++) land = hm[y * N + x] >= SEA_LEVEL;
    if (land) for (let c = Math.max(0, x - gap); c <= Math.min(N - 1, x + gap); c++) clear[c] = 0;
  }
  return clear;
}

function seaSpot(hm, salt, k, kind, near, far, beside = 0) {
  const water = (i) => hm[i] < SEA_LEVEL;
  const seaDist = coastDistance(Array.from(hm, (v) => v < SEA_LEVEL));
  const mask = (i) => water(i) && seaDist[i] >= near && seaDist[i] <= far;
  let out = [];
  if (beside) { // 해변에서 보아 섬 옆을 먼저 (섬 앞뒤 물 위는 섬 밑동에 겹쳐 보인다)
    const clear = besideColumns(hm, beside);
    out = pick((i) => mask(i) && clear[i % N] === 1, salt, k, 24, hm, kind);
  }
  if (!out.length) out = pick(mask, salt, k, 24, hm, kind);
  return out.map((e) => ({ ...e, h: SEA_LEVEL }));
}

function highest(hm) {
  let top = -1, at = 0;
  for (let i = 0; i < hm.length; i++) if (hm[i] > top) { top = hm[i]; at = i; }
  return { top, x: at % N, y: Math.floor(at / N) };
}

/** { elements: [{kind, x, y, h}], mood: {sky, tempo, stars} } */
export function place(seed, hm) {
  const salt = voiceHash(seed);
  const slope = slopeMap(hm);
  const landArr = Array.from(hm, (v) => v >= SEA_LEVEL);
  const dist = coastDistance(landArr);
  const land = (i) => landArr[i];
  const elements = [];
  const mood = { sky: "day", tempo: "normal", stars: false };
  const cats = categories(seed).filter((c) => c !== Category.UNKNOWN && c !== Category.HARMFUL);
  const per = cats.length <= 1 ? 1 : 2;
  const unique = [...new Set(cats)];

  unique.forEach((cat, ci) => {
    const s = (salt ^ Math.imul(cat + 1, 0x9e3779b1) ^ Math.imul(ci, 0x85ebca6b)) >>> 0;
    if (cat === Category.HEALTH) {
      elements.push(...pick((i) => land(i) && hm[i] >= M(4) && hm[i] <= M(45) && slope[i] <= 3 * UNITS_PER_M
        && dist[i] >= 3 && dist[i] <= 14, s, Math.floor(10 / per), 10, hm, "camellia"));
    } else if (cat === Category.LOVE) { // 노을빛 하늘. 곁에 작은 섬은 뺐다 (2026-10-06, brain/island/elements.py와 같다)
      mood.sky = "sunset";
    } else if (cat === Category.FAMILY) {
      const terr = (i) => land(i) && hm[i] >= M(6) && hm[i] <= M(35) && slope[i] <= 2 * UNITS_PER_M
        && dist[i] >= 9; // 물가에서 36m 넘게 안쪽 (모형이 허공으로 삐져나오지 않게)
      const ridge = new Int32Array(N); // 세로줄마다 가장 높은 곳
      for (let i = 0; i < N * N; i++) ridge[i % N] = Math.max(ridge[i % N], hm[i]);
      // 관람객 쪽 비탈, 능선보다 8m 넘게 아래를 먼저 (섬 윤곽 위로 삐져나오지 않게. brain/island/elements.py와 같다)
      const seen = pick((i) => terr(i) && Math.floor(i / N) >= N / 2 && hm[i] <= ridge[i % N] - 8 * UNITS_PER_M,
        s, 2, 30, hm, "terraces");
      elements.push(...(seen.length ? seen : pick(terr, s, 2, 30, hm, "terraces")));
      let lights = pick((i) => land(i) && hm[i] <= M(8) && dist[i] <= 3 && slope[i] <= 2 * UNITS_PER_M,
        (s ^ 0x1234567) >>> 0, Math.floor(6 / per), 6, hm, "village_light");
      if (!lights.length) { // 작고 가파른 원뿔 섬: 완만한 만이 없으면 물가에 불빛 하나 (brain/island/elements.py와 같다)
        lights = pickOne([(i) => land(i) && dist[i] <= 3 && hm[i] <= M(15) && slope[i] <= 4 * UNITS_PER_M,
          (i) => land(i) && dist[i] <= 6 && slope[i] <= 4 * UNITS_PER_M, (i) => land(i) && dist[i] <= 6],
          (s ^ 0x1234567) >>> 0, hm, "village_light"); // 절벽 밑은 피한다
      }
      elements.push(...lights);
    } else if (cat === Category.SUCCESS) {
      const t = highest(hm);
      elements.push({ kind: "summit", x: t.x, y: t.y, h: t.top });
      const gentle = (i) => slope[i] <= 3 * UNITS_PER_M; // 곶의 완만한 곳 먼저 (절벽 비탈에 매달리지 않게)
      elements.push(...pickOne([
        (i) => land(i) && dist[i] <= 4 && hm[i] >= M(8) && gentle(i),
        (i) => land(i) && dist[i] <= 8 && hm[i] >= M(5) && gentle(i),
        (i) => land(i) && dist[i] <= 4 && hm[i] >= M(8),
        (i) => land(i) && dist[i] <= 8 && hm[i] >= M(5),
        (i) => land(i) && dist[i] <= 16,
      ], s, hm, "lighthouse"));
    } else if (cat === Category.ABUNDANCE) {
      elements.push(...seaSpot(hm, s, Math.floor(2 / per) || 1, "anchovy_school", 3, 10));
      elements.push(...pick((i) => land(i) && hm[i] >= M(5) && hm[i] <= M(40) && slope[i] <= 3 * UNITS_PER_M
        && dist[i] >= 4, (s ^ 0xabcdef) >>> 0, Math.floor(8 / per), 8, hm, "yuja"));
    } else if (cat === Category.FREEDOM) {
      elements.push(...seaSpot(hm, s, Math.floor(2 / per) || 1, "sailboat", 8, 30, 8));
      const t = highest(hm);
      elements.push({ kind: "gulls", x: t.x, y: t.y, h: t.top + 25 * UNITS_PER_M });
    } else if (cat === Category.PEACE) {
      mood.tempo = "slow";
      mood.stars = true;
      elements.push(...seaSpot(hm, s, Math.floor(3 / per) || 1, "sparkle", 4, 20));
    } else if (cat === Category.LONGING) {
      mood.tempo = "slow";
      elements.push(...pickOne([
        (i) => land(i) && dist[i] <= 4 && hm[i] >= M(3) && slope[i] <= 2 * UNITS_PER_M, // 완만한 물가 먼저 (절벽 앞 허공에 뜨지 않게)
        (i) => land(i) && dist[i] <= 3 && hm[i] >= M(3),
        (i) => land(i) && dist[i] <= 8,
        (i) => land(i),
      ], s, hm, "lantern"));
    }
  });
  return { elements, mood };
}
