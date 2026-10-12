// 배경화면 그림 (2026-10-12 섬의 증서): 위는 하늘과 섬, 아래는 증서.
// - 잠금 화면의 시계(위 약 22%)는 하늘 위에, 섬은 그 아래에. 아래 모서리의 손전등·카메라 버튼과 홈 막대는 비워 둔다.
// - 증서: 왼쪽 정렬 글(이름, 날짜, 바다의 대답) + 오른쪽 위 해안선 도장, 점선 아래 다시 방문용 QR (가운데).
// - QR은 웹캠이 한 뼘 거리에서 읽는 크기(420px)와 흰 바탕의 검은 무늬를 그대로 지킨다.

import { qrCanvas } from "./qr.js";

export const W = 1170, H = 2532;  // 요즘 휴대폰 세로 화면
const PAPER = "#f4f0e8", INK = "#1f2a2b", INK2 = "#5f6a6a";
const SERIF = "'Mongdol Serif', 'AppleMyungjo', 'Noto Serif KR', serif";
const SANS = "'Mongdol Sans', 'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif";
const PAD = 110;
const QR = 420, TILE_PAD = 24, TILE = QR + TILE_PAD * 2;

async function svgImage(svg) {
  const img = new Image();
  img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  await img.decode();
  return img;
}

function wrapText(ctx, text, maxWidth) {
  const lines = [];
  let line = "";
  for (const word of text.split(" ")) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) { lines.push(line); line = word; } else line = test;
  }
  if (line) lines.push(line);
  return lines;
}

/** 줄 수는 그대로, 줄 길이는 고르게 (마지막 줄에 한 낱말만 남지 않게) */
function balancedWrap(ctx, text, maxWidth) {
  const lines = wrapText(ctx, text, maxWidth);
  if (lines.length < 2) return lines;
  let lo = 0, hi = maxWidth;
  for (let k = 0; k < 18; k++) {
    const mid = (lo + hi) / 2;
    if (wrapText(ctx, text, mid).length > lines.length) lo = mid; else hi = mid;
  }
  return wrapText(ctx, text, hi);
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

async function fontsReady() {
  // 그림에 그리기 전에 글꼴을 읽어 둔다 (못 읽으면 휴대폰 글꼴로)
  await Promise.all([`700 72px ${SERIF}`, `400 40px ${SERIF}`, `500 28px ${SANS}`, `400 30px ${SANS}`]
    .map((f) => document.fonts.load(f).catch(() => null)));
}

/** info: name, answer, stamp(SVG), qr(주소), date(긴 날짜), order(그날 몇 번째, 0부터 또는 null) */
export async function makeWallpaper(view, info) {
  await fontsReady();
  const out = document.createElement("canvas");
  out.width = W;
  out.height = H;
  const ctx = out.getContext("2d");
  const rgb = view.skyColor.map((v) => Math.round(v * 255)).join(",");

  // 하늘과 섬: 섬은 시계 아래 (그림 높이의 약 34%)
  const sceneTop = Math.round(H * 0.12), sceneH = Math.round(H * 0.44), sceneBottom = sceneTop + sceneH;
  ctx.fillStyle = `rgb(${rgb})`;
  ctx.fillRect(0, 0, W, sceneTop + 2);
  ctx.drawImage(view.snapshot(W, sceneH, { fill: 0.74 }), 0, sceneTop);
  const fadeTop = ctx.createLinearGradient(0, sceneTop, 0, sceneTop + H * 0.06);  // 하늘끼리 이어지게
  fadeTop.addColorStop(0, `rgba(${rgb},1)`);
  fadeTop.addColorStop(1, `rgba(${rgb},0)`);
  ctx.fillStyle = fadeTop;
  ctx.fillRect(0, sceneTop, W, H * 0.06);

  // 종이
  const fadeH = Math.round(H * 0.06);
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, sceneBottom, W, H - sceneBottom);
  const fade = ctx.createLinearGradient(0, sceneBottom - fadeH, 0, sceneBottom);
  fade.addColorStop(0, "rgba(244,240,232,0)");
  fade.addColorStop(1, "rgba(244,240,232,1)");
  ctx.fillStyle = fade;
  ctx.fillRect(0, sceneBottom - fadeH, W, fadeH + 1);

  // 해안선 도장: 이름 오른쪽 위, 인주처럼 종이에 스민다
  const stamp = await svgImage(info.stamp);
  const seal = 230, sealX = W - PAD - seal / 2 + 10, sealY = sceneBottom + 120;
  ctx.save();
  ctx.globalCompositeOperation = "multiply";
  ctx.globalAlpha = 0.92;
  ctx.translate(sealX, sealY);
  ctx.rotate(-0.13);
  ctx.drawImage(stamp, -seal / 2, -seal / 2, seal, seal);
  ctx.restore();

  // 글: 왼쪽 정렬
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  let y = sceneBottom + 44;
  ctx.fillStyle = INK2;
  ctx.font = `500 28px ${SANS}`;
  ctx.fillText("몽돌의 소원 · 남해", PAD, y);
  y += 62;
  ctx.fillStyle = INK;
  ctx.font = `700 72px ${SERIF}`;
  ctx.fillText(info.name, PAD, y, W - PAD * 2 - seal);
  y += 108;
  ctx.fillStyle = INK2;
  ctx.font = `400 30px ${SANS}`;
  const meta = info.order === null || info.order === undefined ? info.date : `${info.date} · ${info.order + 1}번째로 솟은 섬`;
  ctx.fillText(meta, PAD, y);
  y += 84;
  ctx.fillStyle = INK;
  let size = 40;
  ctx.font = `400 ${size}px ${SERIF}`;
  let lines = balancedWrap(ctx, info.answer, W - PAD * 2);
  if (lines.length > 2) {  // 세 줄이 되면 조금 작게
    size = 36;
    ctx.font = `400 ${size}px ${SERIF}`;
    lines = balancedWrap(ctx, info.answer, W - PAD * 2);
  }
  lines.forEach((l, i) => ctx.fillText(l, PAD, y + i * size * 1.6));

  // 다시 방문용 QR: 아래 가운데. 아래 모서리 버튼과 홈 막대를 피한다
  const tileY = H - 92 - TILE, tileX = (W - TILE) / 2;
  const captionY = tileY - 58;
  ctx.strokeStyle = "rgba(31,42,43,0.28)";
  ctx.lineWidth = 3;
  ctx.setLineDash([12, 12]);
  ctx.beginPath();
  ctx.moveTo(PAD, captionY - 34);
  ctx.lineTo(W - PAD, captionY - 34);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.textAlign = "center";
  ctx.fillStyle = INK2;
  ctx.font = `400 28px ${SANS}`;
  ctx.fillText("다시 찾아올 때, 화면 위 카메라에 한 뼘 거리로 비춰 주세요", W / 2, captionY);
  if (info.qr) {
    ctx.fillStyle = "#fff";
    roundRect(ctx, tileX, tileY, TILE, TILE, 28);
    ctx.fill();
    ctx.strokeStyle = "rgba(31,42,43,0.10)";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.drawImage(qrCanvas(info.qr, QR), tileX + TILE_PAD, tileY + TILE_PAD, QR, QR);
  }
  return out;
}
