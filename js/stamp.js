// 해안선 도장: 높이 지도의 물가 선(해수면 등고선)을 따서 인주 빛 둥근 도장 SVG로.

import { N, SEA_LEVEL } from "./generator.js";

const INK = "#b3372b";

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

/** 도장 SVG 문자열. dateText 예: "2026. 10. 3." */
export function stampSVG(hm, dateText) {
  const loop = coastline(hm);
  let path = "";
  if (loop.length > 8) {
    const pts = smoothLoop(loop);
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const [x, y] of pts) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
    const s = 92 / Math.hypot(maxX - minX, maxY - minY);  // 섬이 안쪽 원(반지름 약 56)에 들어가게
    path = "M" + pts.map(([x, y]) => `${(100 + (x - cx) * s).toFixed(1)} ${(100 + (y - cy) * s).toFixed(1)}`).join("L") + "Z";
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" role="img" aria-label="내 섬의 해안선 도장">
  <defs>
    <filter id="ink" x="-5%" y="-5%" width="110%" height="110%">
      <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="3" result="n"/>
      <feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -1.6 1.25" result="holes"/>
      <feComposite in="SourceGraphic" in2="holes" operator="in"/>
    </filter>
    <path id="ringTop" d="M 30 100 A 70 70 0 0 1 170 100"/>
    <path id="ringBottom" d="M 33 100 A 67 67 0 0 0 167 100"/>
  </defs>
  <g filter="url(#ink)" fill="none" stroke="${INK}">
    <circle cx="100" cy="100" r="92" stroke-width="4"/>
    <circle cx="100" cy="100" r="84" stroke-width="1.5"/>
    <circle cx="100" cy="100" r="62" stroke-width="1"/>
    <path d="${path}" fill="${INK}" fill-opacity="0.9" stroke-width="1.2" stroke-linejoin="round"/>
    <g fill="${INK}" stroke="none" font-family="'Mongdol Serif','Noto Serif KR','AppleMyungjo','Batang',serif" font-weight="700">
      <text font-size="15" letter-spacing="3" text-anchor="middle"><textPath href="#ringTop" startOffset="50%">南海 · 몽돌의 소원</textPath></text>
      <text font-size="12" letter-spacing="2" text-anchor="middle" dominant-baseline="hanging"><textPath href="#ringBottom" startOffset="50%">${dateText}</textPath></text>
    </g>
  </g>
</svg>`;
}
