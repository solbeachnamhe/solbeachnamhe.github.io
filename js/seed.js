// IslandSeed 읽기 (brain/island/seed.py와 같은 바이트 배치). v1·v2 58바이트(78글자), v3 60바이트(80글자).
//
//   [0] 버전  [1:33] 해안선 64×4비트  [33:49] 음높이 32×4비트  [49:53] 스펙트럼 8×4비트
//   [53] 소원 종류 4비트 | 돌 개수 2비트 | 녹음 상태 2비트
//   [54:56] v1: 날짜 (2026-01-01부터 날 수, big-endian 16비트) / v2: 다시 찾아온 횟수 4비트 | 날짜 12비트
//   [56] 떨림 4비트 | 말 속도 4비트  [57] 함께 모드의 추가 소원 종류 4비트 × 2 (0 = 없음)
//   [58] v3: 손짓 방향 4비트 | 손짓 크기 4비트  [59] v3: 손짓 빠르기 4비트 | 예비 3비트 | 손짓 있음 1비트

export const SUPPORTED = [1, 2, 3];
export const SIZES = { 1: 58, 2: 58, 3: 60 };

export const Category = Object.freeze({
  UNKNOWN: 0, HEALTH: 1, LOVE: 2, FAMILY: 3, SUCCESS: 4, ABUNDANCE: 5,
  FREEDOM: 6, PEACE: 7, LONGING: 8, HARMFUL: 9,
});
export const CATEGORY_NAMES = Object.keys(Category);

export const Quality = Object.freeze({ OK: 0, SHORT: 1, QUIET: 2, CLIPPED: 3 });

function unpack(bytes) {
  const out = [];
  for (const b of bytes) out.push(b >> 4, b & 15);
  return out;
}

export function base64urlToBytes(text) {
  const t = text.trim().replace(/-/g, "+").replace(/_/g, "/");
  if (!/^[A-Za-z0-9+/]*$/.test(t)) throw new Error("IslandSeed: base64url이 아닙니다");
  const bin = atob(t + "=".repeat((4 - (t.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

export function fromBytes(data) {
  if (!SUPPORTED.includes(data[0])) throw new Error(`지원하지 않는 버전: ${data[0]}`);
  const size = SIZES[data[0]];
  if (data.length !== size) throw new Error(`IslandSeed v${data[0]}는 ${size}바이트 (받은 것: ${data.length})`);
  const v2 = data[0] >= 2;
  const v3 = data[0] >= 3;
  const meta = data[53];
  const category = meta >> 4;
  const extra = [data[57] >> 4, data[57] & 15].filter((c) => c !== 0);
  for (const c of [category, ...extra]) {
    if (c >= CATEGORY_NAMES.length) throw new Error(`알 수 없는 소원 종류: ${c}`);
  }
  return Object.freeze({
    version: data[0],
    coast: unpack(data.subarray(1, 33)),
    pitch: unpack(data.subarray(33, 49)),
    bands: unpack(data.subarray(49, 53)),
    category,
    stones: (meta >> 2) & 3,
    quality: meta & 3,
    day: ((data[54] << 8) | data[55]) & (v2 ? 0x0fff : 0xffff),
    revisits: v2 ? data[54] >> 4 : 0,
    tremor: data[56] >> 4,
    rate: data[56] & 15,
    extra,
    gesture: v3 ? (data[59] & 1) === 1 : false,
    gDir: v3 ? data[58] >> 4 : 0,
    gSize: v3 ? data[58] & 15 : 0,
    gSpeed: v3 ? data[59] >> 4 : 7,
    bytes: Uint8Array.from(data),
  });
}

export function fromString(text) {
  return fromBytes(base64urlToBytes(text));
}

/** 섬에 놓일 소원 종류 전부 (함께 모드면 최대 3개). */
export function categories(seed) {
  return [seed.category, ...seed.extra];
}

/** 섬의 빛깔 (손짓 빠르기, brain IslandSeed.tone): −1 천천히 … 0 손짓 없음 … 1 빠르게. */
export function tone(seed) {
  return seed.gesture ? Math.max(-1, Math.min(1, (seed.gSpeed - 7) / 8)) : 0;
}

/** 날짜 (UTC 기준 Date). 2026-01-01 + day. */
export function seedDate(seed) {
  return new Date(Date.UTC(2026, 0, 1 + seed.day));
}
