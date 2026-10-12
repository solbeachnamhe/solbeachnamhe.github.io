// 돌려보는 섬 (Three.js). 색과 모양은 설치 화면(godot/shaders/island.gdshader, godot/scripts/island_elements.gd)을 따른다.
// 높이 지도 → 지형 메시 (1픽셀 = 4m, 해수면 = y 0). 처음에는 설치 화면처럼 관람객 쪽(앞면)을 낮은 각도에서 본다.

import {
  ACESFilmicToneMapping, BoxGeometry, BufferAttribute, BufferGeometry, CanvasTexture, CircleGeometry, Color, ConeGeometry,
  CylinderGeometry, DataTexture, DirectionalLight, Fog, Group, HemisphereLight, LinearFilter, MathUtils, Mesh,
  MeshStandardMaterial, PCFSoftShadowMap, PerspectiveCamera, RepeatWrapping, SRGBColorSpace, Scene, SphereGeometry,
  TorusGeometry, WebGLRenderer,
} from "../vendor/three.min.js?v=20261013a";  // 2026-10-13 그림자·물가 무늬(DataTexture, LinearFilter, PCFSoftShadowMap)를 더해 다시 묶음
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
// 분홍빛이 도는 화강암 (사진 33번 바위 sRGB 약 124 122 119). 2026-10-13: 해를 세게 하며 베이지 회반죽처럼 떠서 회색 쪽으로 낮춤 (전 0.48 0.43 0.39)
const GRANITE = [0.42, 0.395, 0.37];
const ROCK_SLOPE = 0.30;  // island_body rock_slope: 이보다 가파르면 바위
const SURF = [0.86, 0.90, 0.93];  // 밑동의 하얀 물결 (island_body surf_top)
const SURF_TOP = 2.4;  // 하얀 물결 띠 높이 (m)
const SEABED = [0.28, 0.33, 0.30];
const SHALLOW = [0.2, 0.43, 0.44];  // 섬 둘레 얕은 물의 옥빛 (바다에 40%까지 섞는다)

// 섬에 나무는 심지 않는다 (2026-10-05 작가, godot/scripts/island_elements.gd NO_TREES와 같게)
const NO_TREES = ["camellia", "yuja"];

const smoothstep = (a, b, x) => { const t = MathUtils.clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);

/** 높이 격자를 상자 모양으로 흐리게 (가로, 세로 두 번). r = 반지름 (칸) */
function blur(src, g, r) {
  const tmp = new Float32Array(g * g), out = new Float32Array(g * g);
  for (let j = 0; j < g; j++) {
    for (let i = 0; i < g; i++) {
      let s = 0;
      for (let k = -r; k <= r; k++) s += src[j * g + MathUtils.clamp(i + k, 0, g - 1)];
      tmp[j * g + i] = s / (2 * r + 1);
    }
  }
  for (let j = 0; j < g; j++) {
    for (let i = 0; i < g; i++) {
      let s = 0;
      for (let k = -r; k <= r; k++) s += tmp[MathUtils.clamp(j + k, 0, g - 1) * g + i];
      out[j * g + i] = s / (2 * r + 1);
    }
  }
  return out;
}

// 섬의 겉 (2026-10-13 3D 점검: 전에는 점(꼭짓점)마다 색을 칠해 4m 칸이 그대로 보였다 — 절벽은 세로로 늘어난 줄무늬,
// 숲은 위장 무늬 같은 얼룩, 물가는 칼로 자른 선). 이제 화면의 점마다 색을 정한다 (설치 화면 godot/shaders/island_body.gdshaderinc와
// 같은 규칙). 무늬 그림(숲 지붕 1024², 화강암)은 휴대폰에 무거워(약 1.5MB) 계산으로 만든다:
// - 숲: 둥근 나무 지붕(약 5.5m)과 나무 무리(약 16m)가 겹친다. 지붕마다 해 받는 쪽이 밝고 지붕 사이 틈은 그늘
// - 바위: 위·옆 세 방향에서 비춘 화강암 덩어리(옆면은 가로로 긴 덩어리와 가로 결). 세로로 늘어나지 않는다
// - 골짜기: 주변보다 낮은 곳은 하늘빛을 덜 받아 짙다 (aCav, 칸 높이 − 주변 36m 평균)
const TERRAIN_COMMON = /* glsl */`
uniform float uPeak;
uniform float uTone;
uniform float uSurfTop;
uniform vec3 uForestLow;
uniform vec3 uForestHigh;
uniform vec3 uBroadleaf;
uniform vec3 uGranite;
uniform vec3 uSurf;
uniform vec3 uSeabed;
varying vec3 vLocal;
varying vec3 vWN;
varying float vCav;

float th_hash(vec2 p) {
  p = mod(floor(p + 0.5), 289.0);  // 칸 모서리 값이 옆 칸과 똑같게 (island_body hash와 같은 까닭)
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}
vec2 th_hash2(vec2 p) {
  p = mod(floor(p + 0.5), 289.0);
  return fract(sin(vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)))) * 43758.5453);
}
float th_noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(th_hash(i), th_hash(i + vec2(1.0, 0.0)), f.x), mix(th_hash(i + vec2(0.0, 1.0)), th_hash(i + vec2(1.0)), f.x), f.y);
}
// 칸마다 점 하나: xy = 가장 가까운 점까지 (칸), z = 두 번째로 가까운 점과의 거리 차 (0이면 경계), w = 그 점의 번호 0~1
vec4 th_cells(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  float d1 = 8.0, d2 = 8.0, id = 0.0;
  vec2 r1 = vec2(0.0);
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 g = vec2(float(x), float(y));
      vec2 r = g + th_hash2(i + g) - f;
      float d = dot(r, r);
      if (d < d1) { d2 = d1; d1 = d; r1 = r; id = th_hash(i + g + 17.0); }
      else if (d < d2) { d2 = d; }
    }
  }
  return vec4(r1, sqrt(d2) - sqrt(d1), id);
}
// 나무 지붕: 돌려주는 값 = 둥근 지붕 면의 기울기 (수평 xz), light = 밝기 (지붕 가운데 밝고 사이 틈은 그늘)
vec2 th_crowns(vec2 q, float size, out float light) {
  vec4 c = th_cells(q / size);
  float rr = 0.5 + 0.3 * c.w;
  float d = length(c.xy) / rr;
  float dome = sqrt(max(0.0, 1.0 - d * d));
  light = d < 1.0 ? mix(0.6, 1.12, dome) * (0.88 + 0.24 * c.w) : 0.5;
  return d < 1.0 ? -c.xy / rr : vec2(0.0);  // 가운데에서 바깥으로 기운 면
}
// 화강암 (q: m, cell: 덩어리 크기 m): 크고 불규칙한 덩어리, 드문드문 가는 틈, 얼룩진 밝기.
// 덩어리 모양은 잡음으로 흔들어 규칙적인 조각 무늬(거북 등)가 되지 않게, 틈은 일부만 짙게
float th_rock(vec2 q, vec2 cell) {
  vec2 warp = vec2(th_noise(q * 0.035 + 3.0), th_noise(q * 0.035 + 8.0)) - 0.5;
  vec4 c = th_cells(q / cell + warp * 1.4);
  float jointOn = smoothstep(0.55, 0.85, th_noise(q * 0.04 + c.w * 7.0));  // 이 틈이 보이는지 (그물처럼 다 보이지 않게)
  float joint = mix(1.0, mix(0.55, 1.0, smoothstep(0.0, 0.12, c.z)), jointOn);
  float blotch = th_noise(q * 0.02 + 5.0) * 0.5 + th_noise(q * 0.09) * 0.3 + th_noise(q * 0.5) * 0.2;
  float fine = th_noise(q * 1.7) * 0.6 + th_noise(q * 5.0) * 0.4;
  return joint * (0.72 + 0.5 * blotch) * (0.9 + 0.2 * fine) * (0.9 + 0.2 * c.w);
}
`;

const TERRAIN_COLOR = /* glsl */`
  vec3 tp = vLocal;
  vec3 tn = normalize(vWN);
  float th_h = tp.y;
  vec2 tq = tp.xz;
  float slope = 1.0 - clamp(tn.y, 0.0, 1.0);
  float hr = clamp(th_h / uPeak, 0.0, 1.0);
  float fw = length(fwidth(tq));  // 화면 한 점이 덮는 땅 (m): 멀면 잔무늬를 흐린다 (자글거리지 않게)
  float fineK = 1.0 - smoothstep(1.4, 3.2, fw);
  float bigK = 1.0 - smoothstep(4.5, 10.0, fw);
  // 숲: 큰 나무 무리와 잔 나무 지붕
  float lightBig, lightFine;
  vec2 bumpBig = th_crowns(tq, 16.0, lightBig);
  vec2 bumpFine = th_crowns(tq + 3.7, 5.5, lightFine);
  float crownLight = mix(1.0, lightBig, 0.5 * bigK) * mix(1.0, lightFine, 0.55 * fineK);
  vec3 forest = mix(uForestLow, uForestHigh, hr);
  float grove = smoothstep(0.55, 0.75, th_noise(tq * 0.012 + 7.0) * 0.7 + th_noise(tq * 0.05) * 0.3);
  forest = mix(forest, uBroadleaf, grove * 0.7) * crownLight * (1.0 + 0.1 * min(uTone, 0.0));
  // 바위가 드러나는 곳: 가파른 비탈 (꼭대기는 가팔라도 숲, 숲 경계는 들쭉날쭉)
  float edgeN = th_noise(tq * 0.025 + 5.0) * 0.6 + th_noise(tq * 0.09 + 1.0) * 0.4;
  float th_t = ${ROCK_SLOPE.toFixed(2)} - 0.08 * uTone + 0.14 * smoothstep(0.7, 0.95, hr);
  float cap = 1.0 - smoothstep(th_t - 0.06, th_t + 0.06, slope + (edgeN - 0.5) * 0.14);
  // 바위 틈의 작은 덤불: 드물고 옅게 (짙은 점이 몇 개 모이면 눈처럼 보였다)
  float pockets = smoothstep(0.72 + 0.06 * uTone, 0.86 + 0.06 * uTone, th_noise(tq * 0.11 + 2.0) * 0.7 + th_noise(tq * 0.4) * 0.3)
    * smoothstep(0.15, 0.45, hr) * (1.0 - smoothstep(0.3, 0.6, slope));
  float veg = max(cap, pockets * 0.55);
  // 화강암: 위(xz)와 두 옆(zy, xy)에서 비춘 덩어리. 옆면은 가로로 긴 덩어리
  vec3 tw = pow(abs(tn), vec3(4.0));
  tw /= tw.x + tw.y + tw.z;
  float rk = th_rock(tq, vec2(26.0)) * tw.y + th_rock(vec2(tp.z, th_h), vec2(30.0, 13.0)) * tw.x
    + th_rock(vec2(tp.x, th_h), vec2(30.0, 13.0)) * tw.z;
  float lump = th_noise(tq * 0.06 + 9.0) * 0.6 + th_noise(tq * 0.17) * 0.4;
  vec3 gr = uGranite * rk * (0.8 + 0.35 * lump) * (1.0 + 0.08 * max(uTone, 0.0));
  vec3 tc = mix(gr, forest, veg);
  // 물가 바위 띠와 절벽
  float edgeH = 4.5 * (0.6 + 0.8 * th_noise(tq * 0.03)) * (0.7 + 0.6 * smoothstep(0.02, 0.2, slope));
  float rim = (1.0 - smoothstep(edgeH - 2.0, edgeH + 2.0, th_h)) * smoothstep(0.004, 0.02, slope);
  float cliff = smoothstep(0.75, 0.9, slope);
  float rocky = max(rim, cliff);
  tc = mix(tc, gr * 0.95, rocky);
  // 숲 사이로 군데군데 드러난 바위 (가파를수록, 물가에 가까울수록)
  float outcrop = smoothstep(0.66, 0.8, th_noise(tq * 0.05 + 11.0) * 0.55 + th_noise(tq * 0.22) * 0.3 + th_noise(tq * 0.9) * 0.15)
    * smoothstep(0.04, 0.14, slope) * (1.0 - smoothstep(0.15, 0.6, hr));
  tc = mix(tc, gr * 0.85, outcrop * 0.65);
  // 물이 닿는 띠는 젖어 짙고, 밑동에는 군데군데 흰 물결
  float wetBand = 1.0 - smoothstep(0.3, 2.2, th_h);
  tc = mix(tc, tc * 0.5, wetBand);
  // 바위 밑동에 튀어 오른 물보라: 바다의 물거품(SEA_COLOR)에 이어 붙는다. 낮고 부드럽게 (전에는 2.4m 높이의 흰 점선)
  float band = (1.0 - smoothstep(uSurfTop * 0.2, uSurfTop * 0.7, th_h)) * smoothstep(-0.6, -0.1, th_h);
  float sn = th_noise(tq * 0.06) * 0.6 + th_noise(tq * 0.25) * 0.4;
  tc = mix(tc, uSurf, band * smoothstep(0.35, 0.75, sn) * 0.7);
  tc = mix(tc, uSeabed, 1.0 - smoothstep(-2.0, 0.2, th_h));
  // 골짜기 그늘: 주변보다 낮은 곳은 짙다
  float cavAO = clamp(1.0 + clamp(vCav, -14.0, 14.0) * 0.035, 0.55, 1.08);
  tc *= mix(1.0, cavAO, 0.6);
  diffuseColor.rgb = tc;
  float woods = veg * (1.0 - rocky) * (1.0 - outcrop * 0.65) * smoothstep(0.2, 1.5, th_h);
  // 면의 굴곡: 나무 지붕, 바위 옆면의 가로 결 (턱이 해를 받는다)
  vec3 tBump = vec3(bumpBig.x, 0.0, bumpBig.y) * 0.45 * bigK + vec3(bumpFine.x, 0.0, bumpFine.y) * 0.4 * fineK;
  tBump *= woods;
  // 바위 면의 울퉁불퉁함: 면을 따라 가로(u)와 높이(h)로 잡음의 기울기를 재어 면을 흔든다.
  // 화강암은 결이 없이 둥글게 부푼 덩어리라 큰 굴곡 위주 (잔결이 세면 나뭇결처럼 보였다)
  vec3 tside = normalize(vec3(-tn.z, 0.0, tn.x) + 1e-5);
  float tu = dot(tp, tside);
  #define TH_RB(a, b) (th_noise(vec2(a, b) * vec2(0.06, 0.08)) * 0.65 + th_noise(vec2(a, b) * vec2(0.2, 0.24) + 4.0) * 0.35)
  float rb0 = TH_RB(tu, th_h);
  float rbu = TH_RB(tu + 1.5, th_h) - rb0;
  float rbh = TH_RB(tu, th_h + 1.5) - rb0;
  tBump += (-tside * rbu * 3.2 - vec3(0.0, rbh * 3.6, 0.0)) * (1.0 - woods) * (1.0 - tw.y * 0.6) * bigK;
  // 숲 속은 나무끼리 가려 하늘빛을 덜 받는다 (설치 화면 AO와 같은 생각): 해 받는 쪽만 밝고 그늘 쪽은 짙다
  float tAO = mix(0.62, 0.4, woods) * cavAO;
  float tRough = mix(mix(0.86, 0.96, woods), 0.42, wetBand);
`;

function terrain(hm, peak, tone = 0) {
  const g = N, cell = PIXEL_M, half = ((g - 1) * cell) / 2;
  const hs = new Float32Array(g * g);
  for (let i = 0; i < g * g; i++) hs[i] = Math.max((hm[i] - SEA_LEVEL) / UNITS_PER_M, -25);
  // 면의 방향은 흐린 높이로 잰다 (2026-10-13 3D 점검 3번): 4m 칸마다 방향이 달라 절벽에 가는 세로 줄이 생겼다.
  // 완만한 곳은 조금(12m), 가파른 절벽은 더(20m) 흐린다. 바위의 잔 굴곡은 셰이더가 다시 넣는다
  const soft = blur(hs, g, 1), softer = blur(hs, g, 2);
  const wide = blur(hs, g, 4);  // 주변 36m 평균: 골짜기 찾기
  const pos = new Float32Array(g * g * 3), nor = new Float32Array(g * g * 3), cav = new Float32Array(g * g);
  const normalAt = (src, i, j) => {
    const hl = src[j * g + Math.max(i - 1, 0)], hr = src[j * g + Math.min(i + 1, g - 1)];
    const hd = src[Math.max(j - 1, 0) * g + i], hu = src[Math.min(j + 1, g - 1) * g + i];
    const nx = hl - hr, ny = 2 * cell, nz = hd - hu, len = Math.hypot(nx, ny, nz);
    return [nx / len, ny / len, nz / len];
  };
  for (let j = 0; j < g; j++) {
    for (let i = 0; i < g; i++) {
      const k = j * g + i;
      pos.set([i * cell - half, hs[k], j * cell - half], k * 3);
      const a = normalAt(soft, i, j), b = normalAt(softer, i, j);
      const t = smoothstep(0.75, 0.35, a[1]);  // 가파를수록 더 흐린 쪽
      const n = mix(a, b, t), len = Math.hypot(...n);
      nor.set(n.map((v) => v / len), k * 3);
      cav[k] = hs[k] - wide[k];
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
  geo.setAttribute("aCav", new BufferAttribute(cav, 1));
  geo.setIndex(new BufferAttribute(idx, 1));

  const material = new MeshStandardMaterial({ roughness: 0.9, metalness: 0 });
  const lin = (rgb) => new Color().setRGB(...rgb, SRGBColorSpace);
  const uniforms = {
    uPeak: { value: peak }, uTone: { value: tone }, uSurfTop: { value: SURF_TOP },
    uForestLow: { value: lin(FOREST_LOW) }, uForestHigh: { value: lin(FOREST_HIGH) }, uBroadleaf: { value: lin(BROADLEAF) },
    uGranite: { value: lin(GRANITE) }, uSurf: { value: lin(SURF) }, uSeabed: { value: lin(SEABED) },
  };
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nattribute float aCav;\nvarying vec3 vLocal;\nvarying vec3 vWN;\nvarying float vCav;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvLocal = position;\nvWN = normal;\nvCav = aCav;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\n${TERRAIN_COMMON}`)
      .replace("#include <color_fragment>", TERRAIN_COLOR)
      .replace("#include <roughnessmap_fragment>", "#include <roughnessmap_fragment>\nroughnessFactor = tRough;")
      .replace("#include <normal_fragment_maps>",
        "#include <normal_fragment_maps>\nnormal = normalize(normal + (viewMatrix * vec4(tBump, 0.0)).xyz);")
      .replace("#include <aomap_fragment>",
        "reflectedLight.indirectDiffuse *= tAO;\nreflectedLight.indirectSpecular *= tAO;");
  };
  const mesh = new Mesh(geo, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
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

/** 앞뒤 두 면의 삼각형 (돛, 갈매기 날개) */
function triangle(a, b, c) {
  const geo = new BufferGeometry();
  geo.setAttribute("position", new BufferAttribute(new Float32Array([...a, ...b, ...c, ...a, ...c, ...b]), 3));
  geo.computeVertexNormals();
  return geo;
}

function element(kind, rand, sunset = false) {
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
    case "terraces": {
      // 다랭이논 (2026-10-13 3D 점검 5번: 전에는 쨍한 연두 상자 네 장이 섬보다 커 보이고 표면에서 떠 스티커 같았다).
      // 비탈에 묻힌 계단 다섯, 논은 숲보다 조금 밝은 풀빛, 계단 앞 턱은 돌담 회색. 크기는 전의 약 3/4
      const grass = mat([0.34, 0.43, 0.2]), wall = mat([0.36, 0.34, 0.31]);
      for (let k = 0; k < 5; k++) {
        const w = 34 - k * 5, z = -k * 3.2, y = k * 1.8;
        put(root, new BoxGeometry(w, 3, 3.2), grass, [0, y - 0.6, z]);
        put(root, new BoxGeometry(w + 0.6, 1.1, 0.5), wall, [0, y - 0.1, z + 1.6]);
      }
      break;
    }
    case "village_light": {
      // 마을 (전에는 흰 공 하나라 무엇인지 읽히지 않았다): 흰 벽, 짙은 지붕의 작은 집 넷. 노을에는 창에 불빛
      const walls = mat([0.88, 0.86, 0.82]), roof = mat([0.24, 0.27, 0.31]);
      const glow = mat([1.0, 0.78, 0.45], sunset ? 2.5 : 0);
      for (let k = 0; k < 4; k++) {
        const x = range(-7, 7), z = range(-6, 6), yaw = range(0, Math.PI);
        const house = new Group();
        put(house, new BoxGeometry(5, 3, 3.6), walls, [0, 1.5, 0]);
        put(house, new ConeGeometry(3.6, 1.8, 4), roof, [0, 3.9, 0], [1, 1, 0.75]).rotation.y = Math.PI / 4;
        if (sunset) put(house, new BoxGeometry(1, 0.9, 0.2), glow, [0.8, 1.6, 1.85]);
        house.position.set(x, 0, z);
        house.rotation.y = yaw;
        root.add(house);
      }
      break;
    }
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
    case "sailboat": {
      // 돛단배 (2026-10-13 3D 점검 8번: 전에는 갈색 상자 위 흰 삼각형이라 아이콘 같았다): 흰 배, 가는 돛대, 큰 돛과 앞돛,
      // 뒤로 끌리는 옅은 물결. 크기는 설치 화면과 같게 (길이 약 14m, 돛 높이 약 16m)
      const white = mat([0.93, 0.93, 0.91]), sailc = mat([0.96, 0.95, 0.9]);
      put(root, new BoxGeometry(13, 2.2, 4), white, [0, 1.1, 0]);
      put(root, new ConeGeometry(2, 4, 4), white, [8.4, 1.1, 0], [1, 1, 0.98]).rotation.z = -Math.PI / 2;
      put(root, new BoxGeometry(13.4, 0.5, 4.1), mat([0.2, 0.28, 0.38]), [0, 0.4, 0]);
      put(root, new CylinderGeometry(0.25, 0.3, 17, 6), mat([0.7, 0.7, 0.68]), [1, 10.5, 0]);
      put(root, triangle([1, 2.6, 0], [1, 18.5, 0], [-6.5, 2.8, 0.6]), sailc, [0, 0, 0]);
      put(root, triangle([1.4, 16.5, 0], [8.6, 2.4, 0], [1.4, 3.2, 0.4]), sailc, [0, 0, 0]);
      const wake = put(root, new CircleGeometry(1, 20), mat([0.86, 0.9, 0.93]), [-14, 0.06, 0], [14, 2.2, 1]);
      wake.rotation.x = -Math.PI / 2;
      break;
    }
    case "gulls": {
      // 갈매기 (전에는 흰 원뿔 일곱이라 아이콘 같았다): 날개를 비스듬히 든 V자 다섯, 햇빛을 받는 옅은 회색
      const gull = mat([0.86, 0.87, 0.87]);
      for (let k = 0; k < 5; k++) {
        const g = new Group();
        put(g, triangle([0, 0, 0.7], [0, 0, -0.7], [-5, 1.6, -1]), gull, [0, 0, 0]);
        put(g, triangle([0, 0, 0.7], [0, 0, -0.7], [5, 1.6, -1]), gull, [0, 0, 0]);
        g.position.set(range(-55, 55), range(-6, 18), range(-35, 35));
        g.rotation.set(range(-0.25, 0.25), range(0, Math.PI * 2), range(-0.3, 0.3));
        root.add(g);
      }
      break;
    }
    case "sparkle":
      for (let k = 0; k < 26; k++) {
        put(root, sphere(2.2), mat([1.0, 0.97, 0.88], 5), [range(-50, 50), 0.4, range(-25, 25)], [2.4, 0.2, 0.7]);
      }
      break;
    case "lantern":
      put(root, new CylinderGeometry(1.5, 2, 18, 10), mat([0.3, 0.25, 0.2]), [0, 9, 0]);
      put(root, sphere(5), mat([1.0, 0.62, 0.3], 1.3), [0, 20, 0]);  // 낮에도 따뜻한 주황 불빛 (전 8: 흰 점으로 보였다)
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

// 물가 (2026-10-13 3D 점검 2번: 전에는 섬이 바다에 칼로 자른 듯 "놓여" 있었다). 바다의 칸마다 가장 가까운 땅까지의 거리를
// 재어 그림(256², 24칸 = 96m까지)으로 바다에 넘긴다. 바다는 이 거리로 바위 밑의 흰 물거품, 그 바깥의 옅은 거품 띠,
// 섬 가까운 얕은 물빛을 칠한다
const SHORE_CELLS = 24;
function shoreTexture(hm) {
  const g = N, far = 1e6, d = new Float32Array(g * g);
  for (let k = 0; k < g * g; k++) d[k] = hm[k] > SEA_LEVEL ? 0 : far;
  // 두 번 훑는 거리 재기 (가로세로 1, 대각 1.414)
  const relax = (k, k2, w) => { if (d[k2] + w < d[k]) d[k] = d[k2] + w; };
  for (let j = 0; j < g; j++) {
    for (let i = 0; i < g; i++) {
      const k = j * g + i;
      if (i > 0) relax(k, k - 1, 1);
      if (j > 0) relax(k, k - g, 1);
      if (i > 0 && j > 0) relax(k, k - g - 1, 1.414);
      if (i < g - 1 && j > 0) relax(k, k - g + 1, 1.414);
    }
  }
  for (let j = g - 1; j >= 0; j--) {
    for (let i = g - 1; i >= 0; i--) {
      const k = j * g + i;
      if (i < g - 1) relax(k, k + 1, 1);
      if (j < g - 1) relax(k, k + g, 1);
      if (i < g - 1 && j < g - 1) relax(k, k + g + 1, 1.414);
      if (i > 0 && j < g - 1) relax(k, k + g - 1, 1.414);
    }
  }
  const data = new Uint8Array(g * g * 4);
  for (let k = 0; k < g * g; k++) {
    data[k * 4] = Math.round(Math.min(d[k] / SHORE_CELLS, 1) * 255);
    data[k * 4 + 3] = 255;
  }
  const tex = new DataTexture(data, g, g);
  tex.magFilter = tex.minFilter = LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

const SEA_COMMON = /* glsl */`
uniform sampler2D uShore;
uniform float uShoreSpan;
uniform float uShoreHalf;
uniform vec3 uFoam;
uniform vec3 uShallow;
uniform float uShallowMix;
varying vec3 vWorld;
float sh_hash(vec2 p) { p = mod(floor(p + 0.5), 289.0); return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float sh_noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(sh_hash(i), sh_hash(i + vec2(1.0, 0.0)), f.x), mix(sh_hash(i + vec2(0.0, 1.0)), sh_hash(i + vec2(1.0)), f.x), f.y);
}
`;

const SEA_COLOR = /* glsl */`
  {
    vec2 suv = ((vWorld.xz + uShoreHalf) / ${PIXEL_M.toFixed(1)} + 0.5) / ${N.toFixed(1)};
    float dm = texture(uShore, suv).r * uShoreSpan;  // 가장 가까운 땅까지 (m)
    vec2 w = vWorld.xz;
    float n1 = sh_noise(w * 0.09) * 0.6 + sh_noise(w * 0.35) * 0.4;
    float n2 = sh_noise(w * 0.05 + 9.0);
    // 섬 가까운 얕은 물: 옥빛이 조금 돈다 (남해 바위섬 둘레)
    float shallow = 1.0 - smoothstep(0.0, 55.0, dm + (n2 - 0.5) * 20.0);
    diffuseColor.rgb = mix(diffuseColor.rgb, uShallow, shallow * uShallowMix);
    // 바위에 부딪혀 부서지는 물거품: 땅에 붙은 3~6m, 군데군데 두껍다
    float contact = 1.0 - smoothstep(1.0 + 4.0 * n1, 3.0 + 6.0 * n1, dm);
    // 그 바깥의 옅은 거품 띠: 물가를 따라 몇 겹, 끊기고 흐려진다
    float lace = (1.0 - smoothstep(4.0, 26.0, dm)) * smoothstep(0.62, 0.9, sin(dm * 0.75 - n2 * 7.0) * 0.5 + 0.5)
      * smoothstep(0.35, 0.7, n1) * 0.45;
    diffuseColor.rgb = mix(diffuseColor.rgb, uFoam, clamp(contact * (0.55 + 0.45 * n1) + lace, 0.0, 0.9));
  }
`;

/** 섬의 땅의 가운데 (m, 섬 좌표 x z) */
function landCenter(hm) {
  let sx = 0, sz = 0, n = 0;
  for (let y = 0; y < N; y += 2) {
    for (let x = 0; x < N; x += 2) {
      if (hm[y * N + x] >= SEA_LEVEL) { sx += x; sz += y; n++; }
    }
  }
  return n ? [(sx / n - N / 2) * PIXEL_M, (sz / n - N / 2) * PIXEL_M] : [0, 0];
}

/** 가운데(c)에서 (ux, uz) 방향으로 나아가 해안선까지 (m): 물이 세 칸 이어지는 곳 */
function coastDistance(hm, c, ux, uz) {
  let water = 0, last = 0;
  for (let t = 0; t < N * PIXEL_M; t += PIXEL_M) {
    const i = Math.round((c[0] + ux * t) / PIXEL_M + N / 2), j = Math.round((c[1] + uz * t) / PIXEL_M + N / 2);
    if (i < 0 || j < 0 || i >= N || j >= N) break;
    if (hm[j * N + i] >= SEA_LEVEL) { water = 0; last = t; } else if (++water >= 3) break;
  }
  return last;
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
  const landR = landRadius(heightmap), landC = landCenter(heightmap);
  let radius = landR;
  for (const e of elements) {  // 돛단배는 섬 옆 물 위 (elements.js seaSpot beside): 처음 화면에 배까지 들어오게
    if (e.kind === "sailboat") radius = Math.max(radius, Math.hypot(e.x - N / 2, e.y - N / 2) * PIXEL_M + 10);
  }
  scene.fog = new Fog(sky, 1, 2);  // 거리는 카메라 거리에 맞춰 place()에서

  const island = new Group();
  island.add(terrain(heightmap, peak, tone));
  const rand = rng(seedText);
  const boats = [];  // 배경화면을 찍을 때 섬 곁으로 당겨 온다 (snapshot pullBoats)
  for (const e of elements) {
    if (NO_TREES.includes(e.kind)) continue;
    const node = element(e.kind, rand, sunset);
    node.traverse((o) => { o.castShadow = true; });
    node.position.set((e.x - N / 2) * PIXEL_M, (e.h - SEA_LEVEL) / UNITS_PER_M, (e.y - N / 2) * PIXEL_M);
    island.add(node);
    if (e.kind === "sailboat") boats.push(node);
  }
  scene.add(island);

  // 불투명: 바다 밑 지형의 네모난 끝이 비치지 않게. 잔물결 무늬(2026-10-12): 전에는 한 가지 색 판이라 섬이 떠 보였다
  const seaMat = new MeshStandardMaterial({ roughness: 0.32, metalness: 0.0, map: rippleTexture(radius) });
  seaMat.color.setRGB(...(sunset ? SUNSET_SEA : SEA), SRGBColorSpace);
  if (sunset) seaMat.emissive.setRGB(...SUNSET_SEA_GLOW, SRGBColorSpace);
  const lin = (rgb) => new Color().setRGB(...rgb, SRGBColorSpace);
  const shoreUniforms = {
    uShore: { value: shoreTexture(heightmap) }, uShoreSpan: { value: SHORE_CELLS * PIXEL_M },
    uShoreHalf: { value: ((N - 1) * PIXEL_M) / 2 }, uFoam: { value: lin(SURF) }, uShallow: { value: lin(SHALLOW) },
    uShallowMix: { value: sunset ? 0.12 : 0.4 },
  };
  seaMat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, shoreUniforms);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vWorld;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\n${SEA_COMMON}`)
      .replace("#include <map_fragment>", `#include <map_fragment>\n${SEA_COLOR}`);
  };
  const sea = new Mesh(new CircleGeometry(radius * 60, 96), seaMat);  // 끝이 안개 너머로 사라지게 넓게
  sea.rotation.x = -Math.PI / 2;
  scene.add(sea);

  // 빛 (2026-10-13 3D 점검 4번): 전에는 하늘빛(3.2)이 해(2.2)보다 세고 해가 높아(55°) 해 방향이 읽히지 않았다.
  // 하늘빛을 줄이고 해를 세게, 조금 낮고 옆에서(높이 38°, 보는 쪽에서 오른쪽 약 70°) 비춰 비탈마다 밝은 쪽과 그늘이 갈리게.
  // 섬이 스스로 그림자를 드리운다 (골짜기, 봉우리 뒤)
  const hemi = new HemisphereLight(0xffffff, 0x404a46, sunset ? 2.0 : 1.7);
  hemi.color.setRGB(...(sunset ? SUNSET_LIGHT : SKY_LIGHT), SRGBColorSpace);
  scene.add(hemi);
  const sun = new DirectionalLight(0xffffff, sunset ? 3.4 : 3.6);
  sun.color.setRGB(...(sunset ? [1.0, 0.8, 0.62] : [1.0, 0.97, 0.92]), SRGBColorSpace);
  const sunEl = MathUtils.degToRad(38), sunAz = MathUtils.degToRad(60);
  sun.position.set(Math.sin(sunAz) * Math.cos(sunEl), Math.sin(sunEl), Math.cos(sunAz) * Math.cos(sunEl)).multiplyScalar(1500);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -radius * 1.15, right: radius * 1.15, top: radius * 1.15, bottom: -radius * 1.15,
    near: 100, far: 3200 });
  sun.shadow.camera.updateProjectionMatrix();
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 3;  // 해를 비스듬히 받는 절벽에 그림자 줄이 생기지 않게
  scene.add(sun);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false;  // 섬과 해는 움직이지 않는다: 그림자는 한 번만 그린다
  renderer.shadowMap.needsUpdate = true;

  const camera = new PerspectiveCamera(32, 1, 5, radius * 80);
  // 설치 화면은 섬을 해변에서 바라본다: 섬 기준 왼쪽 앞(−10.5°)에서 거의 수평
  // fill: 섬(땅의 반지름)이 화면 가로에서 차지하는 몫. land: 배까지 넣지 않고 섬의 땅만으로 크기를 잡는다 (배경화면, wallpaper.js)
  const view = { azimuth: MathUtils.degToRad(-10.5), elevation: MathUtils.degToRad(5), target: peak * 0.25, fill: 0.95, land: false };

  function place(aspect) {
    camera.aspect = aspect;
    const halfH = Math.atan(Math.tan(MathUtils.degToRad(camera.fov / 2)) * aspect);
    const dist = (view.land ? landR : radius) / Math.tan(halfH) / view.fill;
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
      // 섬을 크게 담으면(land) 섬 옆의 배가 화면 밖으로 나간다: 그림에서만 배를 같은 방향의 해안선 바로 바깥(18m)으로 당긴다.
      // "돛단배가 떠나는 섬"의 배가 그림에 남게 (2026-10-13 3D 점검 7번)
      const boatAt = boats.map((b) => b.position.clone());
      if (frame.land) {
        for (const b of boats) {
          const dx = b.position.x - landC[0], dz = b.position.z - landC[1], d = Math.hypot(dx, dz);
          const to = Math.min(d, coastDistance(heightmap, landC, dx / d, dz / d) + 18);
          b.position.x = landC[0] + (dx / d) * to;
          b.position.z = landC[1] + (dz / d) * to;
        }
      }
      renderer.setPixelRatio(1);
      renderer.setSize(w, h, false);
      place(w / h);
      render();
      const out = document.createElement("canvas");
      out.width = w;
      out.height = h;
      out.getContext("2d").drawImage(canvas, 0, 0, w, h);
      Object.assign(view, saved);
      boats.forEach((b, i) => b.position.copy(boatAt[i]));
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      resize();
      render();
      return out;
    },
    skyColor: skyRGB,
  };
}
