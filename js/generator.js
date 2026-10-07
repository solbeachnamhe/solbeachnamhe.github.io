// IslandSeed → 높이 지도 256×256 (Uint16Array, 행 우선 h[y*256+x]).
// brain/island/generator.py를 그대로 옮긴 것. 두 생성기는 tests/golden/island_v1.json으로 비트 단위 일치를 검사한다
// (web/tests/golden.test.mjs). 계산 순서까지 파이썬과 같게 둔다: a * b // c 는 idiv(a * b, c).
//
// 이식 규칙: 정수만. 나눗셈은 내림(idiv), 나머지는 부호가 제수를 따른다(mod). uint32 곱은 Math.imul.
// 중간값은 2^53 미만.

import { Quality } from "./seed.js";

export const N = 256;
export const PIXEL_M = 4;
export const UNITS_PER_M = 200;
export const SEA_LEVEL = 8192;
export const H_MAX = 65535;

const Q = 4096;
const U = 256; // 거리 단위: 1픽셀 = 256 (1m = 64)

// round(16384 * sin(2πk/64)), k = 0..63
const SIN64 = [
  0, 1606, 3196, 4756, 6270, 7723, 9102, 10394, 11585, 12665, 13623, 14449, 15137, 15679, 16069, 16305,
  16384, 16305, 16069, 15679, 15137, 14449, 13623, 12665, 11585, 10394, 9102, 7723, 6270, 4756, 3196, 1606,
  0, -1606, -3196, -4756, -6270, -7723, -9102, -10394, -11585, -12665, -13623, -14449, -15137, -15679, -16069, -16305,
  -16384, -16305, -16069, -15679, -15137, -14449, -13623, -12665, -11585, -10394, -9102, -7723, -6270, -4756, -3196, -1606,
];

// 정수 도구 -------------------------------------------------------------------

/** 파이썬 a // b (내림). 부동소수점 몫을 정수 검산으로 바로잡는다. */
export function idiv(a, b) {
  let q = Math.floor(a / b);
  let r = a - q * b;
  if (b > 0) {
    while (r < 0) { q -= 1; r += b; }
    while (r >= b) { q += 1; r -= b; }
  } else {
    while (r > 0) { q -= 1; r += b; }
    while (r <= b) { q += 1; r -= b; }
  }
  return q;
}

/** 파이썬 a % b (결과의 부호가 b를 따른다). */
export function mod(a, b) {
  return a - idiv(a, b) * b;
}

const clip = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/** lowbias32. 입력의 하위 32비트만 쓴다. */
export function hash32(x) {
  x >>>= 0;
  x ^= x >>> 16;
  x = Math.imul(x, 0x7feb352d) >>> 0;
  x ^= x >>> 15;
  x = Math.imul(x, 0x846ca68b) >>> 0;
  x ^= x >>> 16;
  return x >>> 0;
}

export function fnv1a(bytes) {
  let h = 0x811c9dc5;
  for (const b of bytes) h = Math.imul((h ^ b) >>> 0, 0x01000193) >>> 0;
  return h;
}

function isqrt(n) {
  let s = Math.floor(Math.sqrt(n));
  if (s * s > n) s -= 1;
  if ((s + 1) * (s + 1) <= n) s += 1;
  return s;
}

/** smoothstep, Q12 [0, Q] → Q12. */
function smooth(t) {
  return idiv(idiv(t * t, Q) * (3 * Q - 2 * t), Q);
}

/** 정수 atan2. 0..65535 (한 바퀴 = 65536). */
function iatan2(dy, dx) {
  const ax = Math.abs(dx), ay = Math.abs(dy);
  const mx = Math.max(ax, ay), mn = Math.min(ax, ay);
  const r = idiv(mn * Q, Math.max(mx, 1));
  let a = idiv(8192 * r, Q) - idiv(idiv(r * (r - Q), Q) * (2552 + idiv(692 * r, Q)), Q);
  if (ay > ax) a = 16384 - a;
  if (dx < 0) a = 32768 - a;
  if (dy < 0) a = 65536 - a;
  return mod(a, 65536);
}

function corner(cx, cy, salt) {
  return (hash32(cx ^ hash32(cy ^ salt)) >>> 16) - 32768;
}

/** 2D value noise. x, y ≥ 0 픽셀 좌표. 약 ±32768. */
function valueNoise(x, y, cell, salt) {
  const ix = idiv(x, cell), iy = idiv(y, cell);
  const fx = smooth(idiv(mod(x, cell) * Q, cell));
  const fy = smooth(idiv(mod(y, cell) * Q, cell));
  const a = corner(ix, iy, salt), b = corner(ix + 1, iy, salt);
  const c = corner(ix, iy + 1, salt), d = corner(ix + 1, iy + 1, salt);
  const top = a + idiv((b - a) * fx, Q);
  const bottom = c + idiv((d - c) * fx, Q);
  return top + idiv((bottom - top) * fy, Q);
}

function fbm(x, y, salt) {
  return idiv(4 * valueNoise(x, y, 64, salt)
    + 2 * valueNoise(x, y, 32, (salt * 3 + 1) >>> 0)
    + valueNoise(x, y, 16, (salt * 7 + 2) >>> 0), 7);
}

// 생성 ----------------------------------------------------------------------

/** 목소리 부분만의 해시. 소원 종류, 날짜, 돌 개수는 섞지 않는다. */
export function voiceHash(seed) {
  const b = seed.bytes;
  return fnv1a([...b.subarray(1, 53), b[53] & 3, b[56]]);
}

/** 섬의 긴 축 방향 (SIN64 칸 0~31)과 길쭉한 정도 (Q12). brain/island/generator.py axis와 같다. */
export function axis(seed, salt) {
  if (seed.gesture) {
    const s = seed.gDir <= 8 ? seed.gDir : seed.gDir - 16;
    return [mod(idiv(8 * s + 3, 6), 32), idiv(Q * (13 + seed.gSize), 10)];
  }
  return [mod(salt, 32), idiv(Q * (13 + seed.rate), 10)];
}

function brightness(seed) {
  const total = seed.bands.reduce((a, b) => a + b, 0);
  if (total === 0) return idiv(Q, 2);
  return idiv(seed.bands.reduce((a, b, i) => a + i * b, 0) * Q, 7 * total);
}

// 섬 종류 (2026-10-06 3D 점검 8번). brain/island/generator.py generate와 같은 계산, 같은 순서

const R0 = 250 * 64; // 섬 기준 반지름 250m (1m = 64)
const C112 = 4588; // 1.12 (Q12)
const C025 = 419430; // 0.025 (Q24)
const CONE_DEN = C112 - 647; // 1.12 − √0.025
const A100 = 18204; // 100도: 섬에서 해변 카메라 쪽
const A60 = 10923;

/** 사인 (Q14). a: 각도 (한 바퀴 65536). SIN64 칸 사이를 곧게 잇는다. */
function isin(a) {
  a = mod(a, 65536);
  const i = idiv(a, 1024), f = mod(a, 1024);
  const s0 = SIN64[i], s1 = SIN64[(i + 1) % 64];
  return s0 + idiv((s1 - s0) * f, 1024);
}

/** 봉우리 하나의 옆모습 (Q12). r: 중심 0 ~ 밑동 Q. steep: 0 둥근 돔 ~ Q 곧은 원뿔. */
function mound(r, steep) {
  const t = clip(Q - idiv(r * r, Q), 0, Q);
  const dome = idiv(t * (t + Q), 2 * Q);
  const cone = Math.max(idiv((C112 - isqrt(r * r + C025)) * Q, CONE_DEN), 0);
  return idiv(dome * (Q - steep) + cone * steep, Q);
}

/** [긴 축 위치 Q12, 상대 높이 Q12] 봉우리 1~4개. 가장 높은 것이 Q, 나머지는 (높이 비율)^4. */
function summits(seed) {
  let p = seed.pitch.map((v) => v * 256);
  for (let pass = 0; pass < 2; pass++) {
    const pad = [p[0], ...p, p[p.length - 1]];
    p = p.map((_, i) => idiv(pad[i] + 2 * pad[i + 1] + pad[i + 2], 4));
  }
  const n = p.length;
  const lo = Math.min(...p), hi = Math.max(...p);
  if (hi - lo < 256) return [[0, Q]];
  const cand = [];
  for (let i = 0; i < n; i++) {
    if ((i === 0 || p[i] >= p[i - 1]) && (i === n - 1 || p[i] > p[i + 1])) cand.push(i);
  }
  cand.sort((a, b) => (p[b] - p[a]) || (a - b));
  const chosen = [];
  for (const i of cand) {
    if (chosen.every((j) => Math.abs(i - j) >= 5)) chosen.push(i);
    if (chosen.length === 4) break;
  }
  const rel = chosen.map((i) => [i, idiv(Q * 35, 100) + idiv((p[i] - lo) * idiv(Q * 65, 100), hi - lo)]);
  const top = Math.max(...rel.map(([, h]) => h));
  const out = rel.map(([i, h]) => {
    const r = idiv(h * Q, top);
    return [idiv((2 * i + 1 - n) * Q, n), idiv(idiv(idiv(r * r, Q) * r, Q) * r, Q)];
  });
  return out.sort((a, b) => (a[0] - b[0]) || (a[1] - b[1]));
}

/** 섬 크기 (Q12, 0.6~1.0): 띄엄띄엄 말할수록 작다. */
function talkSize(seed) {
  const t = clip(idiv((10 * seed.coast.reduce((a, b) => a + b, 0) - 4352) * Q, 1152), 0, Q);
  const size = idiv(Q * 6, 10) + idiv(4 * smooth(t), 10);
  return seed.quality === Quality.SHORT ? idiv(size * 3, 4) : size;
}

/** 각도의 해안 밀기 (Q12). c5: 목소리 크기 곡선 다섯 점 합 (0~75). */
function coastPush(c5, angle) {
  const pos = mod(angle, 65536) * 64;
  const i = idiv(pos, 65536), f = mod(pos, 65536);
  return idiv((c5[i] * (65536 - f) + c5[(i + 1) % 64] * f) * Q, 75 * 65536);
}

export function generate(seed) {
  const salt = voiceHash(seed);
  const [k, e] = axis(seed, salt);
  const cos = SIN64[(k + 16) % 64], sin = SIN64[k];
  const er = Math.min(Math.max(idiv(10 * e - 13 * Q, 15), 0), Q);
  const elong = Q + idiv(16 * er, 10);
  const root = isqrt(elong * Q);
  const size = talkSize(seed);
  const r0 = idiv(R0 * size, Q);
  const halfW = idiv(r0 * Q, root), halfL = idiv(r0 * root, Q);
  const bw = Math.min(Math.max(idiv(100 * brightness(seed) - 22 * Q, 25), 0), Q);
  const steep = idiv(Q, 4) + idiv(3 * bw, 4);
  const H = idiv(idiv(idiv(halfW * 25, 8) * 62, 100) * (idiv(85 * Q, 100) + idiv(30 * bw, 100)), Q);
  const seaCut = idiv(H * 12, 100);

  const n = seed.coast.length;
  const c5 = seed.coast.map((_, i) => {
    let t = 0;
    for (let s = -2; s <= 2; s++) t += seed.coast[mod(i + s, n)];
    return t;
  });
  const peaks = summits(seed).filter(([, s]) => s >= idiv(Q * 8, 100)).map(([t, s]) => [
    idiv(t * (halfL - idiv(halfW * 6, 10)), Q), // 긴 축 위치
    idiv(halfW * (idiv(Q * 62, 100) + idiv(4 * s, 10)), Q), // 밑동 반지름 (긴 축)
    idiv(Q * 8, 10) + idiv(25 * s, 100), // 짧은 축 비율
    idiv(H * s, Q), // 높이
  ]);

  const saltFold = (salt * 13 + 7) >>> 0, saltRoll = (salt * 5 + 3) >>> 0, saltCanopy = (salt * 11 + 5) >>> 0;
  const saltLumps = (salt * 23 + 9) >>> 0, saltRough = (salt * 17 + 1) >>> 0;
  const gullyK = idiv(Q * 100, 15);
  const lumpK = idiv(Q * 4, 100) + idiv(Q * 5 * seed.tremor, 1000);
  const roughK = 2 * UNITS_PER_M + idiv(UNITS_PER_M * 4 * seed.tremor, 5);
  const reach0 = idiv(Q * 85, 100);
  // 물가 절벽 (brain/island/generator.py와 같다)
  let loudest = 0;
  for (let i = 1; i < n; i++) if (c5[i] > c5[loudest]) loudest = i;
  const aDir = A100 + idiv((2 * loudest - 64) * A60, 64);
  const saltWav = (salt * 29 + 3) >>> 0, saltCols = (salt * 31 + 5) >>> 0, saltFoot = (salt * 37 + 1) >>> 0;
  const cliffH = idiv(H * 36, 100), cliffRise = idiv(H * 8, 100), footK = idiv(H * 5, 100);

  const out = new Uint16Array(N * N);
  const hh = new Float64Array(N * N); // 바닷물을 채운 높이 (땅 > 0)
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const X = (2 * x + 1 - N) * (U / 2), Y = (2 * y + 1 - N) * (U / 2);
      const A = idiv(X * cos + Y * sin, 16384);
      const B = idiv(Y * cos - X * sin, 16384);
      const angle = iatan2(idiv(B * Q, halfW), idiv(A * Q, halfL));
      const push = coastPush(c5, angle);
      const reach = reach0 + idiv(30 * push, 100);
      const hlR = idiv(halfL * reach, Q), hwR = idiv(halfW * reach, Q);
      const ea = idiv(A * Q, hlR), eb = idiv(B * Q, hwR);
      const re = isqrt(ea * ea + eb * eb);

      let land = idiv(idiv(idiv(H * 48, 100) * mound(re, idiv(steep, 2)), Q), 1);
      for (const [pa, rho, across, ph] of peaks) {
        const hwS = idiv(hwR * across, Q);
        const da = idiv((A - pa) * Q, rho), db = idiv(B * Q, hwS);
        land = Math.max(land, idiv(ph * mound(isqrt(da * da + db * db), steep), Q));
      }
      land = idiv(land * clip((C112 - re) * 4, 0, Q), Q);

      const fold = Math.abs(fbm(x, y, saltFold));
      const g1 = clip(Q - idiv(fold * gullyK, 32768), 0, Q);
      const gully = idiv(g1 * g1, Q);
      const rel = clip(idiv(land * Q, H), 0, Q);
      land = land - idiv(idiv(idiv(idiv(gully * H, Q) * 15, 100) * (idiv(Q * 6, 10) + idiv(8 * bw, 10)), Q) * rel, Q);
      const roll = fbm(x, y, saltRoll);
      const canopy = valueNoise(x, y, 3, saltCanopy);
      const lumps = fbm(2 * x, 2 * y, saltLumps);
      land = land + idiv(idiv(roll * H * 6, 100), 32768) + idiv(canopy * 240, 32768)
        + idiv(idiv(idiv(lumps * H, 32768) * lumpK, Q) * isqrt(rel * Q), Q);
      const rough = fbm(3 * x, 3 * y, saltRough);
      const near = clip(idiv(land * Q, idiv(H * 3, 10)), 0, Q);
      const x8 = idiv(Math.max(land - seaCut, 0) * Q, 8 * UNITS_PER_M);
      const ex = idiv(Q * Q, Q + x8 + idiv(x8 * x8, 2 * Q));
      land = land + idiv(idiv(idiv(rough * roughK, 32768) * ex, Q) * near, Q);
      if (seed.quality === Quality.QUIET) land = idiv(land * 8, 10);

      let h = land - seaCut;
      if (h > 0) {
        const facing = idiv(isin(iatan2(Y, X) - aDir + 16384), 4);
        const side = smooth(clip(idiv((facing - 205) * Q, 3072), 0, Q));
        const wav = idiv(fbm(x, y, saltWav) + 32768, 16);
        const cols = clip(idiv((idiv(valueNoise(x, y, 5, saltCols) + 32768, 16) - 1229) * Q, 1638), 0, Q);
        const foot = idiv(idiv(valueNoise(x, y, 9, saltFoot) + 32768, 16) * footK, Q);
        let k = idiv(side * (idiv(Q * 35, 100) + idiv(65 * push, 100)), Q);
        k = idiv(k * (idiv(Q * 55, 100) + idiv(60 * wav, 100)), Q);
        k = idiv(k * (idiv(Q * 65, 100) + idiv(50 * cols, 100)), Q);
        const t = clip(idiv((h - UNITS_PER_M - foot) * Q, cliffRise), 0, Q);
        h = h + idiv(idiv(cliffH * k, Q) * smooth(t), Q);
      }
      hh[y * N + x] = h;
    }
  }
  // 섬은 하나: 가장 높은 곳과 이어진 땅(상하좌우)만 남긴다 (brain/island/generator.py와 같다)
  let top = 0;
  for (let i = 1; i < N * N; i++) if (hh[i] > hh[top]) top = i;
  const keep = new Uint8Array(N * N);
  if (hh[top] > 0) {
    const stack = [top];
    keep[top] = 1;
    while (stack.length) {
      const i = stack.pop();
      const x = i % N, y = (i - x) / N;
      for (const j of [x > 0 ? i - 1 : -1, x < N - 1 ? i + 1 : -1, y > 0 ? i - N : -1, y < N - 1 ? i + N : -1]) {
        if (j >= 0 && !keep[j] && hh[j] > 0) { keep[j] = 1; stack.push(j); }
      }
    }
  }
  for (let i = 0; i < N * N; i++) {
    let h = hh[i];
    if (h > 0 && !keep[i]) h = -idiv(UNITS_PER_M, 2);
    h = h > 0 ? Math.max(h, 40) : Math.max(idiv(h * 12, 10), -40 * UNITS_PER_M);
    out[i] = clip(SEA_LEVEL + h, 0, H_MAX);
  }
  return out;
}
