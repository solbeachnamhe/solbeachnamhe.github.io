// 돌려보는 섬 (Three.js). 색과 모양은 설치 화면(godot/shaders/island.gdshader, godot/scripts/island_elements.gd)을 따른다.
// 높이 지도 → 지형 메시 (1픽셀 = 4m, 해수면 = y 0). 처음에는 설치 화면처럼 관람객 쪽(앞면)을 낮은 각도에서 본다.

import {
  ACESFilmicToneMapping, BoxGeometry, BufferAttribute, BufferGeometry, CanvasTexture, CircleGeometry, Color, ConeGeometry,
  CylinderGeometry, DirectionalLight, Fog, Group, HemisphereLight, MathUtils, Mesh, MeshLambertMaterial,
  MeshStandardMaterial, PerspectiveCamera, RepeatWrapping, SRGBColorSpace, Scene, SphereGeometry, TorusGeometry, WebGLRenderer,
} from "../vendor/three.min.js?v=20261012h";  // 2026-10-12 RepeatWrapping을 더해 다시 묶음
import { N, PIXEL_M, SEA_LEVEL, UNITS_PER_M, fnv1a } from "./generator.js";

// 색 (sRGB). 2026-10-05 설치 화면에 맞춤 (작가가 고른 사진 assets/field_photos/04_수평선/한낮/11_KakaoTalk_…_08.jpg):
// 위로 갈수록 짙은 파란 하늘, 짙은 파랑 바다, 짙은 소나무 숲, 물가의 회색 바위 띠.
// 전에는 옅은 하늘색 하늘과 옥빛 청록 바다 (2026-09-26), 그 전에는 흐린 날 회색 (docs/ART_DIRECTION.md 옛 표)
// 이 페이지는 조명이 밝아(HemisphereLight 3.2, 노출 1.2) 칠한 색보다 밝게 보인다. 하늘(배경 그림)은 조명을 받지 않는다
// 하늘: 설치 화면에서 잰 높이별 색 (화면 위쪽 = 약 11도, 수평선 바로 위 = 약 2도)
const SKY = [0.239, 0.533, 0.757];  // 하늘 위쪽: css/card.css --sky와 같게 (머리글, 배경화면 위쪽이 이어지게. 전 옅은 하늘색 0.827 0.882 0.925)
const SKY_MID = [0.318, 0.608, 0.816];
const SKY_HORIZON = [0.45, 0.67, 0.83];  // 수평선 쪽 옅은 빛. 안개도 이 색으로 먼 바다가 하늘에 섞인다
const SKY_LIGHT = [0.827, 0.882, 0.925];  // 하늘에서 오는 빛 (섬과 바다를 비춘다): 파란 하늘 그대로면 섬이 푸르게 물든다
// 노을: 2026-10-12 설치 화면(build/compare/category_love-godot.png)에서 잰 색에 맞춤. 하늘 위 sRGB 192 177 181(연보라 빛),
// 수평선 212 191 174, 바다는 하늘을 비춰 따뜻한 회보라. 전에는 살구빛 하늘(0.95 0.80 0.70)에 회녹색 바다라 설치 화면과 달랐다
const SUNSET_SKY = [0.80, 0.72, 0.74];
const SUNSET_MID = [0.86, 0.77, 0.74];
const SUNSET_HORIZON = [0.92, 0.81, 0.72];
const SUNSET_LIGHT = [0.95, 0.80, 0.70];  // 섬을 비추는 노을빛 (섬 색은 전과 같게)
const SEA = [0.24, 0.355, 0.43];  // 짙은 파랑. 조명을 받아 설치 화면 가운데 바다(sRGB 71 109 143)쯤으로 보인다 (전 옥빛 0.30 0.48 0.52)
const SUNSET_SEA = [0.36, 0.33, 0.38];  // 노을 바다: 하늘을 비춘 회보라 (설치 화면 앞바다 sRGB 97 88 90, 먼 바다 156 128 114)
const SUNSET_SEA_GLOW = [0.13, 0.11, 0.12];  // 노을빛 조명만으로는 갈색으로 어두워져, 하늘이 비친 빛을 조금 더한다
// 섬: 숲 + 바위 섬 (2026-10-06 밤, 작가 사진 33번 가운데 섬. 설치 화면 godot/shaders/island_body.gdshaderinc와 같은 규칙):
// 가파른 곳(물가 절벽)은 분홍빛 화강암, 완만한 곳은 물가까지 숲, 봉우리 꼭대기는 숲. 물가는 젖은 짙은 띠와 군데군데 흰 물결.
// (같은 날 낮에는 섬 전체가 숲, 그 전에는 높이로 나눠 꼭대기만 숲)
// 숲 색 (sRGB): 섬 전체가 숲이 되어(2026-10-06) 전 색(0.24 0.31 0.13 등)은 해 받는 쪽이 sRGB 75 104 51로 작품 화면(37 54 43)과
// 사진 31번 숲(48 59 53)보다 두 배 밝고 노랬다. 이 페이지의 밝은 조명에서 사진 숲쯤 되게 낮춘다
const FOREST_LOW = [0.16, 0.20, 0.15];
const FOREST_HIGH = [0.13, 0.175, 0.125];
const BROADLEAF = [0.195, 0.225, 0.165];
const GRANITE = [0.48, 0.43, 0.39];  // 분홍빛이 도는 화강암 (사진 33번 바위 sRGB 약 124 122 119, 이 페이지의 밝은 조명에서)
const ROCK_SLOPE = 0.30;  // island_body rock_slope: 이보다 가파르면 바위
const SURF = [0.86, 0.90, 0.93];  // 밑동의 하얀 물결 (island_body surf_top)
const SURF_TOP = 2.4;  // 하얀 물결 띠 높이 (m)
const SEABED = [0.28, 0.33, 0.30];

// 섬에 나무는 심지 않는다 (2026-10-05 작가, godot/scripts/island_elements.gd NO_TREES와 같게)
const NO_TREES = ["camellia", "yuja"];

const smoothstep = (a, b, x) => { const t = MathUtils.clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);

function fhash(x, y) {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

function vnoise(x, y) {
  const ix = Math.floor(x), iy = Math.floor(y);
  let fx = x - ix, fy = y - iy;
  fx = fx * fx * (3 - 2 * fx);
  fy = fy * fy * (3 - 2 * fy);
  const a = fhash(ix, iy), b = fhash(ix + 1, iy), c = fhash(ix, iy + 1), d = fhash(ix + 1, iy + 1);
  return (a + (b - a) * fx) + ((c + (d - c) * fx) - (a + (b - a) * fx)) * fy;
}

function terrain(hm, peak, tone = 0) {
  // 섬의 빛깔 (손짓 빠르기): godot island_body tone과 같은 규칙. 천천히 = 숲이 짙고 넓다, 빠르게 = 바위가 더 드러나고 밝다
  const deep = 1 + 0.1 * Math.min(tone, 0), bright = 1 + 0.08 * Math.max(tone, 0);
  const g = N, cell = PIXEL_M, half = ((g - 1) * cell) / 2;
  const hs = new Float32Array(g * g);
  for (let i = 0; i < g * g; i++) hs[i] = Math.max((hm[i] - SEA_LEVEL) / UNITS_PER_M, -25);
  const pos = new Float32Array(g * g * 3), nor = new Float32Array(g * g * 3), col = new Float32Array(g * g * 3);
  const c = new Color();
  for (let j = 0; j < g; j++) {
    for (let i = 0; i < g; i++) {
      const k = j * g + i;
      const x = i * cell - half, z = j * cell - half, h = hs[k];
      pos.set([x, h, z], k * 3);
      const hl = hs[j * g + Math.max(i - 1, 0)], hr = hs[j * g + Math.min(i + 1, g - 1)];
      const hd = hs[Math.max(j - 1, 0) * g + i], hu = hs[Math.min(j + 1, g - 1) * g + i];
      let nx = hl - hr, ny = 2 * cell, nz = hd - hu;
      const len = Math.hypot(nx, ny, nz);
      nx /= len; ny /= len; nz /= len;
      nor.set([nx, ny, nz], k * 3);

      const slope = 1 - MathUtils.clamp(ny, 0, 1);
      const grain = vnoise(x * 0.08, z * 0.08) * 0.6 + vnoise(x * 0.4, z * 0.4) * 0.4;
      // 색 규칙은 godot/shaders/island_body.gdshaderinc와 같다 (숲 → 활엽수 무리 → 가파른 곳 화강암 → 젖은 물가 → 흰 물결 → 바다 밑)
      const grove = smoothstep(0.55, 0.75, vnoise(x * 0.012 + 7, z * 0.012 + 7) * 0.7 + vnoise(x * 0.05, z * 0.05) * 0.3);
      let rgb = mix(FOREST_LOW, FOREST_HIGH, MathUtils.clamp(h / peak, 0, 1));
      rgb = mix(rgb, BROADLEAF, grove * 0.7).map((v) => v * (0.82 + 0.3 * grain) * deep);
      // 바위: 가파른 곳 (꼭대기는 숲). 숲 경계가 들쭉날쭉
      const hRatio = MathUtils.clamp(h / peak, 0, 1);
      const edgeN = vnoise(x * 0.025 + 5, z * 0.025 + 5) * 0.6 + vnoise(x * 0.09 + 1, z * 0.09 + 1) * 0.4;
      const th = ROCK_SLOPE - 0.08 * tone + 0.14 * smoothstep(0.7, 0.95, hRatio);
      const veg = 1 - smoothstep(th - 0.06, th + 0.06, slope + (edgeN - 0.5) * 0.14);
      const lump = vnoise(x * 0.06 + 9, z * 0.06 + 9) * 0.6 + vnoise(x * 0.17, z * 0.17) * 0.4;
      const fiss = vnoise((x + z) * 0.71 * 0.32 + vnoise(x * 0.05, z * 0.05) * 3, h * 0.035) * 0.6
        + vnoise((z - x) * 0.71 * 0.6, h * 0.06) * 0.4;  // 절벽의 세로 틈
      const gr = GRANITE.map((v) => v * (0.75 + 0.45 * lump) * (1 - 0.4 * smoothstep(0.38, 0.22, lump))
        * (1 - 0.35 * smoothstep(0.64, 0.84, fiss)) * (0.9 + 0.2 * grain) * bright);
      rgb = mix(gr, rgb, veg);
      rgb = mix(rgb, rgb.map((v) => v * 0.55), 1 - smoothstep(0.3, 2.2, h));  // 물이 닿는 띠는 젖어 짙다
      const surf = (1 - smoothstep(SURF_TOP * 0.45, SURF_TOP, h)) * smoothstep(-0.8, -0.2, h)
        * smoothstep(0.6, 0.82, vnoise(x * 0.06, z * 0.06) * 0.6 + vnoise(x * 0.25, z * 0.25) * 0.4) * 0.7;
      rgb = mix(rgb, SURF, surf);  // 군데군데 흰 물결
      rgb = mix(rgb, SEABED, 1 - smoothstep(-2, 0.2, h));
      c.setRGB(rgb[0], rgb[1], rgb[2], SRGBColorSpace);
      col.set([c.r, c.g, c.b], k * 3);
    }
  }
  const idx = new Uint32Array((g - 1) * (g - 1) * 6);
  let p = 0;
  for (let j = 0; j < g - 1; j++) {
    for (let i = 0; i < g - 1; i++) {
      const a = j * g + i, b = a + 1, cc = a + g, d = cc + 1;
      idx.set([a, cc, b, b, cc, d], p);
      p += 6;
    }
  }
  const geo = new BufferGeometry();
  geo.setAttribute("position", new BufferAttribute(pos, 3));
  geo.setAttribute("normal", new BufferAttribute(nor, 3));
  geo.setAttribute("color", new BufferAttribute(col, 3));
  geo.setIndex(new BufferAttribute(idx, 1));
  return new Mesh(geo, new MeshLambertMaterial({ vertexColors: true }));
}

// 섬 요소 (설치 화면의 임시 모양과 같은 크기와 색) ----------------------------------------

function rng(seedText) {
  let a = fnv1a(new TextEncoder().encode(seedText));
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function mat(rgb, emission = 0) {
  const m = new MeshStandardMaterial({ roughness: 0.8 });
  m.color.setRGB(...rgb, SRGBColorSpace);
  if (emission > 0) {
    m.emissive.setRGB(...rgb, SRGBColorSpace);
    m.emissiveIntensity = Math.min(emission, 2.5);
  }
  return m;
}

function put(root, geo, material, [x, y, z], scale = [1, 1, 1]) {
  const mesh = new Mesh(geo, material);
  mesh.position.set(x, y, z);
  mesh.scale.set(...scale);
  root.add(mesh);
  return mesh;
}

const sphere = (r) => new SphereGeometry(r, 10, 6);

function element(kind, rand) {
  const root = new Group();
  const range = (lo, hi) => lo + (hi - lo) * rand();
  switch (kind) {
    case "camellia":
      put(root, sphere(9), mat([0.12, 0.22, 0.12]), [0, 4, 0], [1, 0.7, 1]);
      for (let k = 0; k < 5; k++) {
        const a = rand() * Math.PI * 2;
        put(root, sphere(2.2), mat([0.8, 0.08, 0.12], 0.6), [Math.cos(a) * 6, 6 + rand() * 3, Math.sin(a) * 6]);
      }
      break;
    case "lighthouse":
      put(root, new CylinderGeometry(5, 7, 48, 16), mat([0.95, 0.95, 0.93]), [0, 24, 0]);
      put(root, new CylinderGeometry(1.5, 6.2, 8, 16), mat([0.75, 0.12, 0.1]), [0, 52, 0]);
      put(root, sphere(4), mat([1.0, 0.95, 0.7], 6), [0, 47, 0]);
      break;
    case "summit":
      put(root, new TorusGeometry(24.5, 2.5, 8, 48), mat([1.0, 0.9, 0.6], 3), [0, 8, 0]).rotation.x = Math.PI / 2;
      break;
    case "terraces":
      for (let k = 0; k < 4; k++) {
        const m = mat([0.45 * (1 - k * 0.05), 0.62 * (1 - k * 0.05), 0.28 * (1 - k * 0.05)]);
        put(root, new BoxGeometry(46 - k * 9, 2, 30 - k * 5), m, [0, 1 + k * 2.2, -k * 3]);
      }
      break;
    case "village_light":
      put(root, sphere(2.2), mat([1.0, 0.78, 0.45], 3), [0, 3, 0]);
      break;
    case "anchovy_school":
      for (let k = 0; k < 40; k++) {
        put(root, sphere(2), mat([0.9, 0.94, 1.0], 3), [range(-35, 35), 0.6, range(-20, 20)], [1.8, 0.35, 0.7]);
      }
      break;
    case "yuja":
      put(root, sphere(6), mat([0.16, 0.3, 0.14]), [0, 5, 0]);
      for (let k = 0; k < 6; k++) {
        const a = rand() * Math.PI * 2;
        put(root, sphere(1.6), mat([0.98, 0.78, 0.15], 0.4), [Math.cos(a) * 4.5, 6 + rand() * 2, Math.sin(a) * 4.5]);
      }
      break;
    case "sailboat":
      put(root, new BoxGeometry(14, 2.5, 4.5), mat([0.5, 0.35, 0.22]), [0, 1.2, 0]);
      put(root, new ConeGeometry(5.5, 16, 3), mat([0.97, 0.96, 0.92]), [0, 10.5, 0], [1, 1, 0.08]);
      break;
    case "gulls":
      for (let k = 0; k < 7; k++) {
        put(root, new ConeGeometry(1.6, 13, 3), mat([0.98, 0.98, 0.98], 0.6),
          [range(-60, 60), range(-10, 20), range(-40, 40)], [1, 1, 0.4]).rotation.z = Math.PI / 2;
      }
      break;
    case "sparkle":
      for (let k = 0; k < 26; k++) {
        put(root, sphere(2.2), mat([1.0, 0.97, 0.88], 5), [range(-50, 50), 0.4, range(-25, 25)], [2.4, 0.2, 0.7]);
      }
      break;
    case "lantern":
      put(root, new CylinderGeometry(1.5, 2, 18, 10), mat([0.3, 0.25, 0.2]), [0, 9, 0]);
      put(root, sphere(5), mat([1.0, 0.72, 0.4], 8), [0, 20, 0]);
      break;
    default:
      break;
  }
  return root;
}

// 보기 ------------------------------------------------------------------------

/** 섬의 땅이 중심에서 얼마나 먼지 (m): 카메라 거리 정하기. */
function landRadius(hm) {
  let r = 60;
  for (let y = 0; y < N; y += 2) {
    for (let x = 0; x < N; x += 2) {
      if (hm[y * N + x] >= SEA_LEVEL) r = Math.max(r, Math.hypot(x - N / 2, y - N / 2) * PIXEL_M);
    }
  }
  return r;
}

// 잔물결: 짧은 밝은 결(하늘이 비침)과 어두운 결(물결 그늘)을 흩뿌린 무늬를 바다에 촘촘히 깐다.
// 무늬 한 장이 약 18m: 섬 가까이에서는 잔결로, 멀리서는 안개에 섞여 사라진다
function rippleTexture(radius) {
  const cv = document.createElement("canvas");
  cv.width = 256;
  cv.height = 256;
  const ctx = cv.getContext("2d");
  ctx.fillStyle = "#e8e8e8";
  ctx.fillRect(0, 0, 256, 256);
  let s = 7;
  const rand = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
  for (let k = 0; k < 520; k++) {
    const x = rand() * 256, y = rand() * 256, w = 8 + rand() * 34, light = rand() < 0.42;
    ctx.strokeStyle = light ? `rgba(255,255,255,${0.3 + rand() * 0.4})` : `rgba(70,72,84,${0.12 + rand() * 0.2})`;
    ctx.lineWidth = 0.7 + rand() * 1.5;
    for (const dx of [0, -256, 256]) {  // 가장자리에서 이어지게
      ctx.beginPath();
      ctx.moveTo(x + dx, y);
      ctx.quadraticCurveTo(x + dx + w / 2, y - 1.2 + rand() * 2.4, x + dx + w, y);
      ctx.stroke();
    }
  }
  const tex = new CanvasTexture(cv);
  tex.colorSpace = SRGBColorSpace;
  tex.wrapS = tex.wrapT = RepeatWrapping;
  const span = radius * 60 * 2;  // 바다 원의 지름
  tex.repeat.set(span / 18, span / 18 / 4);  // 가로로 길쭉한 결
  tex.anisotropy = 8;
  return tex;
}

// 하늘 배경 그림: 위(top)에서 수평선(horizon) 쪽으로 옅어진다. 수평선 자리(화면 위에서의 비율)는 보는 각도에 따라
// 바뀌므로 각도가 바뀔 때마다 다시 칠한다 (2×256 그림이라 가볍다)
function skyBackground(top, mid, horizon) {
  const cv = document.createElement("canvas");
  cv.width = 2;
  cv.height = 256;
  const ctx = cv.getContext("2d");
  const css = (c) => `rgb(${c.map((v) => Math.round(v * 255)).join(",")})`;
  const tex = new CanvasTexture(cv);
  tex.colorSpace = SRGBColorSpace;
  let last = null;
  tex.paint = (h) => {
    h = MathUtils.clamp(h, 0.02, 1);
    if (last !== null && Math.abs(h - last) < 0.002) return;
    last = h;
    const g = ctx.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, css(top));
    g.addColorStop(h * 0.6, css(mid));
    g.addColorStop(h, css(horizon));
    g.addColorStop(1, css(horizon));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 2, 256);
    tex.needsUpdate = true;
  };
  return tex;
}

export function createIslandView(canvas, { heightmap, elements, mood, seedText, tone = 0, autoRotate = true, active = true }) {
  const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: "low-power" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.2;

  const sunset = mood.sky === "sunset";
  const skyRGB = sunset ? SUNSET_SKY : SKY;
  const horizonRGB = sunset ? SUNSET_HORIZON : SKY_HORIZON;
  const sky = new Color().setRGB(...horizonRGB, SRGBColorSpace);  // 안개 색
  const scene = new Scene();
  const skyTex = skyBackground(skyRGB, sunset ? SUNSET_MID : SKY_MID, horizonRGB);
  scene.background = skyTex;

  let top = SEA_LEVEL;
  for (const v of heightmap) top = Math.max(top, v);
  const peak = Math.max((top - SEA_LEVEL) / UNITS_PER_M, 30);
  let radius = landRadius(heightmap);
  for (const e of elements) {  // 돛단배는 섬 옆 물 위 (elements.js seaSpot beside): 처음 화면에 배까지 들어오게
    if (e.kind === "sailboat") radius = Math.max(radius, Math.hypot(e.x - N / 2, e.y - N / 2) * PIXEL_M + 10);
  }
  scene.fog = new Fog(sky, 1, 2);  // 거리는 카메라 거리에 맞춰 place()에서

  const island = new Group();
  island.add(terrain(heightmap, peak, tone));
  const rand = rng(seedText);
  for (const e of elements) {
    if (NO_TREES.includes(e.kind)) continue;
    const node = element(e.kind, rand);
    node.position.set((e.x - N / 2) * PIXEL_M, (e.h - SEA_LEVEL) / UNITS_PER_M, (e.y - N / 2) * PIXEL_M);
    island.add(node);
  }
  scene.add(island);

  // 불투명: 바다 밑 지형의 네모난 끝이 비치지 않게. 잔물결 무늬(2026-10-12): 전에는 한 가지 색 판이라 섬이 떠 보였다
  const seaMat = new MeshStandardMaterial({ roughness: 0.32, metalness: 0.0, map: rippleTexture(radius) });
  seaMat.color.setRGB(...(sunset ? SUNSET_SEA : SEA), SRGBColorSpace);
  if (sunset) seaMat.emissive.setRGB(...SUNSET_SEA_GLOW, SRGBColorSpace);
  const sea = new Mesh(new CircleGeometry(radius * 60, 96), seaMat);  // 끝이 안개 너머로 사라지게 넓게
  sea.rotation.x = -Math.PI / 2;
  scene.add(sea);

  const hemi = new HemisphereLight(0xffffff, 0x404a46, 3.2);
  hemi.color.setRGB(...(sunset ? SUNSET_LIGHT : SKY_LIGHT), SRGBColorSpace);
  scene.add(hemi);
  const sun = new DirectionalLight(0xffffff, sunset ? 2.6 : 2.2);
  sun.color.setRGB(...(sunset ? [1.0, 0.8, 0.62] : [1.0, 0.98, 0.95]), SRGBColorSpace);
  sun.position.set(0.287, 0.819, 0.497).multiplyScalar(1000);  // 설치 화면 태양 방향 (-55°, 30°)
  scene.add(sun);

  const camera = new PerspectiveCamera(32, 1, 5, radius * 80);
  // 설치 화면은 섬을 해변에서 바라본다: 섬 기준 왼쪽 앞(−10.5°)에서 거의 수평
  // fill: 섬(땅의 반지름)이 화면 가로에서 차지하는 몫. 배경화면은 여백을 두려고 줄인다 (wallpaper.js)
  const view = { azimuth: MathUtils.degToRad(-10.5), elevation: MathUtils.degToRad(5), target: peak * 0.25, fill: 0.95 };

  function place(aspect) {
    camera.aspect = aspect;
    const halfH = Math.atan(Math.tan(MathUtils.degToRad(camera.fov / 2)) * aspect);
    const dist = radius / Math.tan(halfH) / view.fill;
    scene.fog.near = dist * 0.55;  // 설치 화면처럼 섬에도 옅은 안개, 수평선은 하늘과 섞이게
    scene.fog.far = dist * 3.2;
    camera.position.set(
      Math.sin(view.azimuth) * Math.cos(view.elevation) * dist,
      view.target + Math.sin(view.elevation) * dist,
      Math.cos(view.azimuth) * Math.cos(view.elevation) * dist,
    );
    camera.lookAt(0, view.target, 0);
    camera.updateProjectionMatrix();
    // 수평선은 화면 가운데보다 tan(내려다보는 각)/tan(시야 반각)의 절반만큼 위에 있다
    skyTex.paint(0.5 - Math.tan(view.elevation) / Math.tan(MathUtils.degToRad(camera.fov / 2)) / 2);
  }

  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    place(w / h);
  }

  function render() {
    renderer.render(scene, camera);
  }

  // 손가락으로 돌리기. 가만히 두면 천천히 스스로 돈다.
  let dragging = null, lastInput = performance.now(), running = false, lastT = 0;
  canvas.addEventListener("pointerdown", (ev) => {
    dragging = { x: ev.clientX, y: ev.clientY };
    canvas.setPointerCapture(ev.pointerId);
    lastInput = performance.now();
  });
  canvas.addEventListener("pointermove", (ev) => {
    if (!dragging) return;
    view.azimuth -= (ev.clientX - dragging.x) * 0.008;
    view.elevation = MathUtils.clamp(view.elevation + (ev.clientY - dragging.y) * 0.005,
      MathUtils.degToRad(4), MathUtils.degToRad(60));
    dragging = { x: ev.clientX, y: ev.clientY };
    lastInput = performance.now();
    place(camera.aspect);
    render();
  });
  const end = () => { dragging = null; lastInput = performance.now(); };
  canvas.addEventListener("pointerup", end);
  canvas.addEventListener("pointercancel", end);

  function loop(t) {
    if (!running) return;
    const dt = Math.min((t - (lastT || t)) / 1000, 0.1);
    lastT = t;
    if (autoRotate && !dragging && t - lastInput > 3000) {
      view.azimuth += dt * MathUtils.degToRad(mood.tempo === "slow" ? 3 : 5);
      place(camera.aspect);
      render();
    }
    requestAnimationFrame(loop);
  }
  function setRunning(on) {
    on = on && active;  // 섬 그림을 보고 있을 때(캔버스가 숨었을 때)는 돌리지 않는다
    if (on === running) return;
    running = on;
    lastT = 0;
    if (on) requestAnimationFrame(loop);
  }
  document.addEventListener("visibilitychange", () => setRunning(!document.hidden));
  window.addEventListener("resize", () => { if (active) { resize(); render(); } });

  resize();
  render();
  setRunning(!document.hidden);

  return {
    /** 캔버스를 보이거나 숨긴 뒤 부른다: 보일 때만 크기를 맞추고 돈다 */
    setActive(on) {
      active = on;
      if (on) { resize(); render(); lastInput = performance.now() - 3000; }
      setRunning(!document.hidden);
    },
    /** 지금 보이는 섬을 w×h 그림으로 (배경화면용). 화면 캔버스를 잠깐 그 크기로 그린 뒤 되돌린다. */
    snapshot(w, h, frame = {}) {
      const saved = { ...view };
      Object.assign(view, frame);
      renderer.setPixelRatio(1);
      renderer.setSize(w, h, false);
      place(w / h);
      render();
      const out = document.createElement("canvas");
      out.width = w;
      out.height = h;
      out.getContext("2d").drawImage(canvas, 0, 0, w, h);
      Object.assign(view, saved);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      resize();
      render();
      return out;
    },
    skyColor: skyRGB,
  };
}
