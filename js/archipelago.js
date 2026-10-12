// 오늘의 군도에서 내 섬의 자리 (2026-10-07 작가: 내 섬 찾기).
// 작품 화면은 그날 k번째 섬(0부터)을 늘 같은 자리 k % 10에 띄운다. 그 자리 표를 godot/scripts/archipelago.gd
// (_h, _build_table, slot)와 같은 규칙으로 만들어, 화면 수평선 위 어디쯤인지 작은 그림으로 보여 준다.
// 자리 규칙을 바꾸면 이 파일도 같이 바꾼다 (ROWS, KEEP_CLEAR, NEAR_HALF, SPAN, 카메라).

const ROWS = [
  { z: -2200, scale: 0.34, n: 3 },  // 가까운 겹
  { z: -3200, scale: 0.32, n: 3 },
  { z: -4500, scale: 0.30, n: 4 },  // 먼 겹
];
const KEEP_CLEAR = [-0.17, 0.18];
const NEAR_HALF = 0.044;
const SPAN = [-0.367, 0.401];
const CAM_Z = 3.6;
// 화면: world.gd 카메라 (세로 시야 42도, 16:9, 조금 오른쪽을 본다)
const CAM_YAW = Math.atan2(0.3, 3.6 + 30);
const HALF_TAN = Math.tan((42 / 2) * Math.PI / 180) * (16 / 9);

export const SLOTS = ROWS.reduce((n, r) => n + r.n, 0);
const VIEW = [0.12, 0.9];  // 그림에 담는 화면 가로 범위 (군도는 약 0.22~0.81)

function h(i, k) {
  const s = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453;
  return s - Math.floor(s);
}

const azimuth = (f) => SPAN[0] + (SPAN[1] - SPAN[0]) * f;

function buildTable() {
  const total = SLOTS;
  const cells = [];
  for (let k = 0; k < total; k++) cells.push({ row: -1, f: (k + 0.5 + (h(k, 4) - 0.5) * 0.35) / total });
  const open = [];
  for (let k = 0; k < total; k++) {
    const az = azimuth(cells[k].f);
    if (az < KEEP_CLEAR[0] - NEAR_HALF || az > KEEP_CLEAR[1] + NEAR_HALF) open.push(k);
  }
  const n0 = Math.min(ROWS[0].n, open.length);
  for (let j = 0; j < n0; j++) cells[open[Math.trunc(((j + 0.5) * open.length) / n0)]].row = 0;
  const rest = total - n0;
  const used = ROWS.map(() => 0);
  let seen = 0, prev = -1;
  for (let k = 0; k < total; k++) {
    if (cells[k].row === 0) { prev = 0; continue; }
    let best = -1, bestNeed = -Infinity;
    for (let ri = 1; ri < ROWS.length; ri++) {
      let need = (ROWS[ri].n * (seen + 1)) / rest - used[ri];
      if (used[ri] >= ROWS[ri].n) need -= 100;
      if (ri === prev) need -= 0.5;
      if (need > bestNeed) { bestNeed = need; best = ri; }
    }
    cells[k].row = best;
    used[best]++;
    seen++;
    prev = best;
  }
  const key = (a) => (((0.5 + a * 0.618034) % 1) + 1) % 1;
  return [...Array(total).keys()].sort((a, b) => key(a) - key(b)).map((k) => cells[k]);
}

const TABLE = buildTable();

/** 자리 i (그날 i번째 섬, 0부터): 화면 가로 위치(0~1), 겹(0 가까움 ~ 2 멂), 보이는 크기(가까운 겹 평균 = 1) */
export function slotView(i) {
  const cell = TABLE[i % TABLE.length];
  const row = ROWS[cell.row];
  const z = row.z + (h(i, 1) - 0.5) * 300;
  const az = azimuth(cell.f);
  const x = Math.tan(az) * (CAM_Z - z);  // 섬의 x (m)
  const dist = Math.hypot(x, CAM_Z - z);
  const screen = 0.5 + Math.tan(az - CAM_YAW) / (2 * HALF_TAN);
  const size = (row.scale * (1 + (h(i, 2) - 0.5) * 0.5) / dist) / (ROWS[0].scale / (CAM_Z - ROWS[0].z));
  return { screen, row: cell.row, size };
}

/** 작품 화면 수평선을 줄인 그림 (SVG 글자): 오늘의 군도 열 자리를 먹빛 실루엣으로 (먼 겹일수록 옅게),
 *  내 자리는 인주 빛으로. 2026-10-12 소원증 "섬의 증서": 종이 위 선 그림 (전에는 파란 하늘과 바다 사각형) */
export function archipelagoMapSVG(order) {
  const W = 320, H = 84, horizon = 58;
  const INK = "31,42,43", SEAL = "#b23a2c";
  const mine = order % SLOTS;
  const mounds = [];
  for (let i = 0; i < SLOTS; i++) {
    const v = slotView(i);
    const w = 40 * v.size, hgt = w * 0.34;
    const cx = ((v.screen - VIEW[0]) / (VIEW[1] - VIEW[0])) * W;  // 군도가 있는 가운데 쪽만 넓혀 그린다
    const fill = i === mine ? SEAL : `rgba(${INK},${[0.42, 0.26, 0.15][v.row]})`;
    mounds.push({ i, cx, w, hgt, fill, row: v.row });
  }
  mounds.sort((a, b) => b.row - a.row);  // 먼 겹부터 그린다
  const shapes = mounds.map((m) =>
    `<path d="M${(m.cx - m.w / 2).toFixed(1)} ${horizon} Q${m.cx.toFixed(1)} ${(horizon - m.hgt * 2).toFixed(1)} ` +
    `${(m.cx + m.w / 2).toFixed(1)} ${horizon} Z" fill="${m.fill}"/>`).join("");
  const me = mounds.find((m) => m.i === mine);
  const top = horizon - me.hgt - 8;
  const waves = [66, 72, 78].map((y, k) =>  // 물결 몇 줄
    `<path d="M${16 + k * 22} ${y} H${W - 16 - k * 22}" stroke="rgba(${INK},${0.12 - k * 0.03})" stroke-width="1"/>`).join("");
  return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="작품 화면 수평선에서 내 섬의 자리">
${shapes}
<path d="M0 ${horizon} H${W}" stroke="rgba(${INK},0.45)" stroke-width="1"/>
${waves}
<path d="M${me.cx.toFixed(1)} ${(top - 14).toFixed(1)} V${top.toFixed(1)}" stroke="${SEAL}" stroke-width="1.2"/>
<circle cx="${me.cx.toFixed(1)}" cy="${(top - 17).toFixed(1)}" r="3" fill="${SEAL}"/></svg>`;
}
