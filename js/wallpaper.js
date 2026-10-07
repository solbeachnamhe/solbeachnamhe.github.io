// 배경화면 그림: 위는 하늘과 섬, 아래는 섬 이름, 바다의 대답, 해안선 도장, 다시 방문용 QR.

import { qrCanvas } from "./qr.js";

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

export async function makeWallpaper(view, info) {
  const W = 1170, H = 2532;  // 요즘 휴대폰 세로 화면. 위쪽은 잠금 화면 시계 자리
  const out = document.createElement("canvas");
  out.width = W;
  out.height = H;
  const ctx = out.getContext("2d");
  const rgb = view.skyColor.map((v) => Math.round(v * 255)).join(",");
  const top = Math.round(H * 0.1), islandH = Math.round(H * 0.52), low = top + islandH;

  ctx.fillStyle = `rgb(${rgb})`;
  ctx.fillRect(0, 0, W, top + 2);
  ctx.drawImage(view.snapshot(W, islandH), 0, top);
  const fadeTop = ctx.createLinearGradient(0, top, 0, top + H * 0.06);  // 하늘끼리 이어지게
  fadeTop.addColorStop(0, `rgba(${rgb},1)`);
  fadeTop.addColorStop(1, `rgba(${rgb},0)`);
  ctx.fillStyle = fadeTop;
  ctx.fillRect(0, top, W, H * 0.06);

  const paper = "233,229,220";
  ctx.fillStyle = `rgb(${paper})`;
  ctx.fillRect(0, low, W, H - low);
  const fade = ctx.createLinearGradient(0, low - H * 0.07, 0, low);
  fade.addColorStop(0, `rgba(${paper},0)`);
  fade.addColorStop(1, `rgba(${paper},1)`);
  ctx.fillStyle = fade;
  ctx.fillRect(0, low - H * 0.07, W, H * 0.07 + 1);

  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillStyle = "#2c3a3a";
  ctx.font = "600 66px 'Noto Serif KR', 'AppleMyungjo', 'Batang', serif";
  ctx.fillText(info.name, W / 2, low + 60);
  ctx.font = "44px 'Noto Serif KR', 'AppleMyungjo', 'Batang', serif";
  ctx.fillStyle = "#4b5959";
  const lines = wrapText(ctx, info.answer, W * 0.78);
  lines.forEach((l, i) => ctx.fillText(l, W / 2, low + 170 + i * 68));
  // 아래: 해안선 도장(왼쪽)과 다시 방문용 QR(오른쪽). QR은 잠금 화면에서도 웹캠에 비출 수 있게 크게
  const stamp = await svgImage(info.stamp);
  const size = 300, qrSize = 420, y = Math.max(low + 200 + lines.length * 68, H - qrSize - 260);
  ctx.save();
  ctx.translate(W / 2 - 250, y + qrSize / 2);
  ctx.rotate(-0.1);
  ctx.drawImage(stamp, -size / 2, -size / 2, size, size);
  ctx.restore();
  if (info.qr) ctx.drawImage(qrCanvas(info.qr, qrSize), W / 2 + 30, y, qrSize, qrSize);
  return out;
}
