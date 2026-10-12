// 배경화면 그림 (2026-10-12 섬의 증서, 같은 날 다시 검토해 고침): 하늘과 바다 위에 증서 한 장이 떠 있다.
// - 잠금 화면의 시계(위 약 22%)는 하늘 위에, 섬은 그 아래(약 35%). 아래 모서리의 손전등·카메라 버튼과 홈 막대는 비워 둔다.
// - 증서: 위 모서리가 둥근 종이가 바다 위로 올라와 있다 (전에는 바다가 회색 띠로 번지며 종이가 되어 얼룩져 보였다).
//   왼쪽 정렬 글(이름, 날짜, 바다의 대답) + 오른쪽 위 해안선 도장, 점선 아래 다시 방문용 QR (가운데).
// - QR은 웹캠이 한 뼘 거리에서 읽는 크기(420px)와 흰 바탕의 검은 무늬를 그대로 지킨다.

import { qrCanvas } from "./qr.js";
import { stampCanvas } from "./stamp.js?v=20261012i";

export const W = 1170, H = 2532;  // 요즘 휴대폰 세로 화면
const PAPER = "#f4f0e8", INK = "#1f2a2b", INK2 = "#5f6a6a";
const SERIF = "'Mongdol Serif', 'AppleMyungjo', 'Noto Serif KR', serif";
const SANS = "'Mongdol Sans', 'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif";
const SIDE = 44, INSET = 76;  // 바다가 보이는 양옆 폭, 종이 안 여백
const QR = 420, TILE_PAD = 24, TILE = QR + TILE_PAD * 2;

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
  await Promise.all([`600 76px ${SANS}`, `400 44px ${SERIF}`, `500 30px ${SANS}`, `400 34px ${SANS}`]
    .map((f) => document.fonts.load(f).catch(() => null)));
}

/** 그림 아래 몇 줄의 평균 색 (바다를 아래로 이어 칠한다) */
function bottomColor(canvas) {
  const rows = 6;
  const data = canvas.getContext("2d").getImageData(0, canvas.height - rows, canvas.width, rows).data;
  const sum = [0, 0, 0];
  for (let i = 0; i < data.length; i += 4) { sum[0] += data[i]; sum[1] += data[i + 1]; sum[2] += data[i + 2]; }
  const n = data.length / 4;
  return sum.map((v) => Math.round(v / n));
}

/** info: name, answer, hm(높이 지도), stampDate(짧은 날짜), qr(주소), date(긴 날짜), order(그날 몇 번째, 0부터 또는 null) */
export async function makeWallpaper(view, info) {
  await fontsReady();
  const out = document.createElement("canvas");
  out.width = W;
  out.height = H;
  const ctx = out.getContext("2d");
  const rgb = view.skyColor.map((v) => Math.round(v * 255)).join(",");

  // 하늘과 섬 (섬은 그림 높이의 약 35%), 그 아래로 바다를 이어 칠한다
  const sceneTop = Math.round(H * 0.12), sceneH = Math.round(H * 0.46), sceneBottom = sceneTop + sceneH;
  ctx.fillStyle = `rgb(${rgb})`;
  ctx.fillRect(0, 0, W, sceneTop + 2);
  // 섬이 그림의 주인공 (2026-10-13 3D 점검 7번: 전 fill 0.8은 배까지 넣느라 섬이 화면 폭의 약 1/4). 배는 섬 곁으로 당겨 온다
  const scene = view.snapshot(W, sceneH, { fill: 0.9, land: true });
  ctx.drawImage(scene, 0, sceneTop);
  const fadeTop = ctx.createLinearGradient(0, sceneTop, 0, sceneTop + H * 0.06);  // 하늘끼리 이어지게
  fadeTop.addColorStop(0, `rgba(${rgb},1)`);
  fadeTop.addColorStop(1, `rgba(${rgb},0)`);
  ctx.fillStyle = fadeTop;
  ctx.fillRect(0, sceneTop, W, H * 0.06);
  const sea = bottomColor(scene);
  const deep = ctx.createLinearGradient(0, sceneBottom, 0, H);
  deep.addColorStop(0, `rgb(${sea})`);
  deep.addColorStop(1, `rgb(${sea.map((v) => Math.round(v * 0.82))})`);
  ctx.fillStyle = deep;
  ctx.fillRect(0, sceneBottom - 1, W, H - sceneBottom + 1);

  // 증서: 위 모서리가 둥근 종이가 바다 위로 올라온다
  const sheetTop = sceneBottom - 120, sheetX = SIDE, sheetW = W - SIDE * 2;
  ctx.save();
  ctx.shadowColor = "rgba(16,22,28,0.28)";
  ctx.shadowBlur = 48;
  ctx.shadowOffsetY = -4;
  ctx.fillStyle = PAPER;
  roundRect(ctx, sheetX, sheetTop, sheetW, H - sheetTop + 80, 52);
  ctx.fill();
  ctx.restore();

  // 해안선 도장: 이름 오른쪽 위, 인주처럼 종이에 스민다
  const seal = 250, sealX = sheetX + sheetW - INSET - seal / 2 + 6, sealY = sheetTop + INSET + 118;
  ctx.save();
  ctx.globalCompositeOperation = "multiply";
  ctx.translate(sealX, sealY);
  ctx.rotate(-0.13);
  ctx.drawImage(stampCanvas(info.hm, info.stampDate, seal * 2), -seal / 2, -seal / 2, seal, seal);
  ctx.restore();

  // 글: 왼쪽 정렬
  const left = sheetX + INSET, textW = sheetW - INSET * 2;
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  let y = sheetTop + INSET;
  ctx.fillStyle = INK2;
  ctx.font = `500 30px ${SANS}`;
  ctx.fillText("몽돌의 소원 · 남해", left, y);
  y += 62;
  ctx.fillStyle = INK;
  // 섬 이름은 굵은 고딕 (2026-10-12 작가: 소원증 화면의 제목과 같게). 대답은 명조 그대로
  let nameSize = 76;
  ctx.font = `600 ${nameSize}px ${SANS}`;
  while (ctx.measureText(info.name).width > textW - seal - 10 && nameSize > 60) {  // 긴 이름은 도장에 닿지 않게
    nameSize -= 2;
    ctx.font = `600 ${nameSize}px ${SANS}`;
  }
  ctx.fillText(info.name, left, y);
  y += 116;
  ctx.fillStyle = INK2;
  ctx.font = `400 34px ${SANS}`;
  const meta = info.order === null || info.order === undefined ? info.date : `${info.date} · ${info.order + 1}번째로 솟은 섬`;
  ctx.fillText(meta, left, y);
  y += 92;

  // 다시 방문용 QR 자리 (아래에서부터 잡는다)
  const tileY = H - 96 - TILE, tileX = (W - TILE) / 2;
  const captionY = tileY - 62, perfY = captionY - 38;

  ctx.fillStyle = INK;
  let size = 44, lines;
  for (;;) {  // 대답이 점선에 닿으면 조금씩 작게
    ctx.font = `400 ${size}px ${SERIF}`;
    lines = balancedWrap(ctx, info.answer, textW);
    if (y + lines.length * size * 1.62 < perfY - 36 || size <= 34) break;
    size -= 2;
  }
  lines.forEach((l, i) => ctx.fillText(l, left, y + i * size * 1.62));

  ctx.strokeStyle = "rgba(31,42,43,0.26)";
  ctx.lineWidth = 3;
  ctx.setLineDash([12, 12]);
  ctx.beginPath();
  ctx.moveTo(left, perfY);
  ctx.lineTo(left + textW, perfY);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.textAlign = "center";
  ctx.fillStyle = INK2;
  ctx.font = `400 32px ${SANS}`;
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
