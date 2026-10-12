// 해안선 도장: 높이 지도의 물가 선(해수면 등고선)을 따서 인주 빛 둥근 도장 SVG로.

import { N, SEA_LEVEL } from "./generator.js";

const INK = "#b23a2c";  // 인주 (css/card.css --seal)
const SERIF = "'Mongdol Serif', 'AppleMyungjo', 'Noto Serif KR', serif";

/** 마칭 스퀘어로 해수면 선을 따고, 가장 긴 고리 하나를 돌려준다. 점은 높이 지도 픽셀 좌표. */
export function coastline(hm, step = 2) {
  const g = N / step;
  const v = (i, j) => {
    if (i < 0 || j < 0 || i >= g || j >= g) return -1;
    return hm[(j * step) * N + i * step] - SEA_LEVEL + 0.5;
  };
  const segs = [];
  const lerp = (a, b, pa, pb) => {
    const t = a / (a - b);
    return [pa[0] + (pb[0] - pa[0]) * t, pa[1] + (pb[1] - pa[1]) * t];
  };
  for (let j = -1; j < g; j++) {
    for (let i = -1; i < g; i++) {
      const c = [[i, j], [i + 1, j], [i + 1, j + 1], [i, j + 1]];
      const val = c.map(([x, y]) => v(x, y));
      const edges = [];
      for (let e = 0; e < 4; e++) {
        const a = val[e], b = val[(e + 1) % 4];
        if ((a >= 0) !== (b >= 0)) edges.push(lerp(a, b, c[e], c[(e + 1) % 4]));
      }
      if (edges.length === 2) segs.push(edges);
      else if (edges.length === 4) segs.push([edges[0], edges[1]], [edges[2], edges[3]]);
    }
  }
  // 조각을 이어 고리로
  const key = (p) => `${p[0].toFixed(3)},${p[1].toFixed(3)}`;
  const byPoint = new Map();
  segs.forEach((s, idx) => {
    for (const p of s) {
      const k = key(p);
      if (!byPoint.has(k)) byPoint.set(k, []);
      byPoint.get(k).push(idx);
    }
  });
  const used = new Uint8Array(segs.length);
  let best = [];
  for (let start = 0; start < segs.length; start++) {
    if (used[start]) continue;
    used[start] = 1;
    const loop = [segs[start][0], segs[start][1]];
    for (;;) {
      const tail = loop[loop.length - 1];
      const next = (byPoint.get(key(tail)) || []).find((i) => !used[i]);
      if (next === undefined) break;
      used[next] = 1;
      const [a, b] = segs[next];
      loop.push(key(a) === key(tail) ? b : a);
    }
    if (loop.length > best.length) best = loop;
  }
  return best.map(([x, y]) => [x * step, y * step]);
}

function smoothLoop(pts, passes = 2) {
  let p = pts;
  for (let k = 0; k < passes; k++) {
    const out = [];
    for (let i = 0; i < p.length; i++) {
      const a = p[i], b = p[(i + 1) % p.length];
      out.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25], [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]);
    }
    p = out;
  }
  return p;
}

/** 도장의 섬 모양: 200×200 상자 안 점들 (섬이 안쪽 원 반지름 약 56에 들어가게). 땅이 없으면 null */
function islandShape(hm) {
  const loop = coastline(hm);
  if (loop.length <= 8) return null;
  const pts = smoothLoop(loop);
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of pts) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
  const s = 92 / Math.hypot(maxX - minX, maxY - minY);
  return pts.map(([x, y]) => [100 + (x - cx) * s, 100 + (y - cy) * s]);
}

function rng(text) {  // 도장마다 같은 잉크 결 (같은 소원증은 늘 같은 도장)
  let a = 2166136261;
  for (const ch of text) a = Math.imul(a ^ ch.codePointAt(0), 16777619);
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 원을 따라 글자를 놓는다. top이면 위쪽 호를 왼쪽에서 오른쪽으로, 아니면 아래쪽 호를 바로 선 글자로 */
function arcText(ctx, text, r, top, spacing) {
  const chars = [...text];
  const widths = chars.map((ch) => ctx.measureText(ch).width);
  const total = widths.reduce((s, w) => s + w, 0) + spacing * (chars.length - 1);
  let acc = 0;
  chars.forEach((ch, i) => {
    const at = (acc + widths[i] / 2) / r, half = total / 2 / r;
    const a = top ? -Math.PI / 2 - half + at : Math.PI / 2 + half - at;
    ctx.save();
    ctx.translate(100 + r * Math.cos(a), 100 + r * Math.sin(a));
    ctx.rotate(top ? a + Math.PI / 2 : a - Math.PI / 2);
    ctx.fillText(ch, 0, 0);
    ctx.restore();
    acc += widths[i] + spacing;
  });
}

/** 해안선 도장을 px×px 그림으로 (2026-10-12: SVG 대신 캔버스. 글꼴이 소원증 명조로 또렷하게 찍힌다).
 *  글꼴을 먼저 읽어 둔 뒤 부른다. dateText 예: "2026. 10. 3." */
export function stampCanvas(hm, dateText, px) {
  const out = document.createElement("canvas");
  out.width = px;
  out.height = px;
  const ctx = out.getContext("2d");
  ctx.scale(px / 200, px / 200);
  ctx.strokeStyle = INK;
  ctx.fillStyle = INK;
  for (const [r, w] of [[92, 4.2], [84, 1.4], [62, 1.1]]) {
    ctx.lineWidth = w;
    ctx.beginPath();
    ctx.arc(100, 100, r, 0, Math.PI * 2);
    ctx.stroke();
  }
  const shape = islandShape(hm);
  if (shape) {
    ctx.beginPath();
    shape.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
    ctx.lineJoin = "round";
    ctx.lineWidth = 1.2;
    ctx.fill();
    ctx.stroke();
  }
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `700 14.5px ${SERIF}`;
  arcText(ctx, "남해 · 몽돌의 소원", 73, true, 2.2);
  ctx.font = `700 12px ${SERIF}`;
  arcText(ctx, dateText, 73, false, 1.6);

  // 인주 결: 군데군데 덜 묻은 자리 (같은 도장은 늘 같은 결)
  const rand = rng(dateText + shape?.length);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = "destination-out";
  const unit = px / 200;
  for (let k = 0; k < 900; k++) {
    ctx.globalAlpha = 0.25 + rand() * 0.6;
    ctx.beginPath();
    ctx.arc(rand() * px, rand() * px, (0.25 + rand() * 0.9) * unit, 0, Math.PI * 2);
    ctx.fill();
  }
  for (let k = 0; k < 14; k++) {  // 넓게 옅어진 자리
    ctx.globalAlpha = 0.12 + rand() * 0.16;
    ctx.beginPath();
    ctx.arc(rand() * px, rand() * px, (14 + rand() * 30) * unit, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
  return out;
}
