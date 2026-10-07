// 소원증 (S10). 주소의 # 뒤 IslandSeed만으로 설치 화면과 같은 섬을 다시 만든다.
// 이 페이지는 아무것도 서버로 보내지 않는다 (index.html의 Content-Security-Policy: connect-src 'none').
// "나만의 소원"은 이 휴대폰 브라우저 안(localStorage)에만 둔다.

import { ANSWERS, CARD_FOOTER, ISLAND_NAMES, PLACES } from "./content.js";
import { place } from "./elements.js";
import { generate } from "./generator.js";
import { createIslandView } from "./island3d.js";
import { fromString, seedDate, tone } from "./seed.js";
import { stampSVG } from "./stamp.js";
import { cardUrl, qrCanvas } from "./qr.js";
import { makeWallpaper } from "./wallpaper.js";
import { archipelagoMapSVG } from "./archipelago.js";

const $ = (id) => document.getElementById(id);

function readSeed() {
  // # 뒤: 섬(IslandSeed) + 있으면 ".번호" (그날 몇 번째로 솟은 섬, 1부터. brain/card.py)
  const full = decodeURIComponent(location.hash.replace(/^#/, "")).trim();
  if (!full) return null;
  const [text, num] = full.split(".", 2);
  const order = /^[1-9][0-9]{0,4}$/.test(num || "") ? Number(num) - 1 : null;
  try {
    return { seed: fromString(text), text, full, order };
  } catch {
    return null;
  }
}

function showToday(order, cardDate, dateText) {
  // 내 섬 찾기: 작품 화면은 그날 k번째 섬을 늘 같은 자리에 띄운다 (js/archipelago.js). 그날이 지나면 지난 일로 말한다
  if (order === null) return;
  const now = new Date();
  const today = now.getFullYear() === cardDate.getUTCFullYear() && now.getMonth() === cardDate.getUTCMonth()
    && now.getDate() === cardDate.getUTCDate();
  $("today-order").textContent = `${dateText}, 남해에 ${order + 1}번째로 솟은 섬`;
  $("today-map").innerHTML = archipelagoMapSVG(order);
  $("today-note").textContent = today
    ? "작품 화면 수평선의 이 자리에 떠 있어요. 뒤로 새 섬이 열 개 더 솟으면 자리를 물려주고 바다 멀리 물러나요."
    : "그날 작품 화면 수평선의 이 자리에 떠 있었어요.";
  $("today").hidden = false;
}

function formatDate(d) {
  return { long: `${d.getUTCFullYear()}년 ${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일`,
    short: `${d.getUTCFullYear()}. ${d.getUTCMonth() + 1}. ${d.getUTCDate()}.` };
}

// 나만의 소원 (이 휴대폰에만) ---------------------------------------------------------

function memoStore(seedText) {
  const key = `mongdol:wish:${seedText}`;
  return {
    get() { try { return localStorage.getItem(key) || ""; } catch { return ""; } },
    set(v) { try { v ? localStorage.setItem(key, v) : localStorage.removeItem(key); return true; } catch { return false; } },
  };
}

function setupMemo(seedText) {
  const store = memoStore(seedText);
  const area = $("memo-text"), status = $("memo-status");
  area.value = store.get();
  const show = (msg) => { status.textContent = msg; };
  if (area.value) show("이 휴대폰에 적어 둔 소원이에요.");
  $("memo-save").addEventListener("click", () => {
    const v = area.value.trim();
    show(store.set(v) ? (v ? "남겨 두었어요. 이 소원증을 다시 열면 보여요." : "지웠어요.") : "이 브라우저에서는 남길 수 없어요 (사생활 보호 모드).");
  });
  $("memo-clear").addEventListener("click", () => {
    area.value = "";
    store.set("");
    show("지웠어요.");
  });
}

// 섬 그림 (첫 화면) -----------------------------------------------------------
// 2026-10-07 작가 1안: 소원증의 첫 목적은 섬 그림을 받아 가는 것. 페이지를 열면 바로 배경화면 그림(섬 + 다시 방문용 QR)을
// 그려 첫 화면에 보이고, 버튼 하나로 사진첩에 저장한다.
// - https 주소의 휴대폰: 공유 창 → "이미지 저장" (그림은 미리 만들어 둔다. 공유 창은 누른 순간에만 열 수 있다)
// - 공유 창이 없는 휴대폰 (시험용 http 주소 등): 그림을 길게 눌러 "사진 앱에 저장" (전에는 파일 앱 › 다운로드로 가서 못 찾았다)
// - 컴퓨터: 파일로 받기

async function preparePicture(view, info) {
  const canvas = await makeWallpaper(view, info);
  const blob = await new Promise((r) => canvas.toBlob(r, "image/png"));
  const file = new File([blob], "mongdol-island.png", { type: "image/png" });
  const img = $("picture");
  img.src = URL.createObjectURL(blob);
  await img.decode().catch(() => {});
  img.hidden = false;
  $("picture-wait").hidden = true;
  return file;
}

function setupSave(file) {
  const button = $("save-picture"), how = $("save-how"), status = $("save-status");
  const canShare = !!(navigator.canShare && navigator.canShare({ files: [file] }));
  const touch = matchMedia("(pointer: coarse)").matches;
  const android = /Android/.test(navigator.userAgent);
  how.textContent = canShare ? "누르면 나오는 창에서 “이미지 저장”을 고르세요."
    : touch ? `그림을 길게 누른 뒤 ${android ? "“이미지 다운로드”를" : "“사진 앱에 저장”을"} 누르면 사진첩에 들어가요.`
      : "그림 파일로 받아요.";
  button.disabled = false;
  button.addEventListener("click", async () => {
    status.textContent = "";
    if (canShare) {
      try {
        await navigator.share({ files: [file] });
      } catch (e) { /* 공유 창을 닫았다 */ }
    } else if (touch) {  // 공유 창이 없으면 그림을 길게 눌러야 한다: 그림으로 데려가고 안내를 짙게
      how.classList.add("nudge");
      $("picture").scrollIntoView({ behavior: "smooth", block: "center" });
    } else {
      const a = document.createElement("a");
      a.href = $("picture").src;
      a.download = file.name;
      a.click();
      status.textContent = "mongdol-island.png로 받았어요.";
    }
  });
}

// 시작 ------------------------------------------------------------------------

function main() {
  const found = readSeed();
  if (!found) {
    document.body.classList.add("missing");
    return;
  }
  const { seed, text, full, order } = found;
  const hm = generate(seed);
  const { elements, mood } = place(seed, hm);
  const date = formatDate(seedDate(seed));
  const cat = seed.category;
  const url = cardUrl(full);  // 다시 방문용 QR에도 번호를 둔다 (웹캠은 번호를 버리고 섬만 읽는다)
  const info = { name: ISLAND_NAMES[cat], answer: ANSWERS[cat], stamp: stampSVG(hm, date.short), qr: url };

  document.body.classList.toggle("sunset", mood.sky === "sunset");
  $("island-name").textContent = info.name;
  $("island-date").textContent = `${date.long}, 남해 바다에서`;
  if (seed.revisits > 0) {
    $("island-revisits").textContent = `${seed.revisits}번 다시 찾아온 섬`;
    $("island-revisits").hidden = false;
  }
  qrCanvas(url, 600, $("return-qr"));
  $("answer").textContent = info.answer;
  $("stamp").innerHTML = info.stamp;
  showToday(order, seedDate(seed), date.long);
  const p = PLACES[cat];
  $("place-name").textContent = p.name;
  $("place-where").textContent = `경남 남해군 ${p.where}`;
  $("place-line").textContent = p.line;
  $("footer-line").textContent = CARD_FOOTER;

  const still = new URLSearchParams(location.search).has("still");  // 비교용 (tools/compare_island.py): 스스로 돌지 않음
  const view = createIslandView($("island"), { heightmap: hm, elements, mood, seedText: text, tone: tone(seed),
    autoRotate: !still });
  setupMemo(text);
  document.body.classList.add("ready");
  preparePicture(view, info).then(setupSave).catch(() => {
    $("picture-wait").textContent = "그림을 만들지 못했어요. 아래 섬을 화면 캡처해 두셔도 돼요.";
  });
}

main();
window.addEventListener("hashchange", () => location.reload());
