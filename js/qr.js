// 다시 방문용 QR (Phase 8). 설치 화면 위 웹캠이 이 QR을 읽으면 섬이 돌아온다 (brain/vision/cards.py).
// 합성 시험 결과 QR 한 변이 웹캠 화면에서 약 170픽셀 이상이어야 읽힌다: 휴대폰 화면에 크게, 흰 여백을 넉넉히.

import qrcode from "../vendor/qrcode.min.js";

/** text의 QR을 흰 여백 4칸과 함께 size×size 캔버스로. */
export function qrCanvas(text, size, canvas = document.createElement("canvas")) {
  const q = qrcode(0, "M");
  q.addData(text);
  q.make();
  const n = q.getModuleCount();
  const cells = n + 8;
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = "#000";
  const cell = size / cells;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if (q.isDark(y, x)) ctx.fillRect(Math.floor((x + 4) * cell), Math.floor((y + 4) * cell), Math.ceil(cell), Math.ceil(cell));
    }
  }
  return canvas;
}

/** 이 소원증의 주소 (설치 화면이 만든 것과 같은 모양: 기본 주소 + # + IslandSeed). */
export function cardUrl(seedText) {
  return `${location.origin}${location.pathname}#${seedText}`;
}
