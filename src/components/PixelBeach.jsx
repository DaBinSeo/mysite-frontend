import { useEffect, useRef } from 'react'

// 도트 그래픽 해변 (Codex 화면 시안의 그림을 따름). 작은 캔버스(W×H)에 픽셀을 직접 찍고 CSS로 확대해(pixelated) 도트 느낌을 낸다.
// 하늘·바다·모래를 한 번에 칠한 뒤 해·구름 → 양쪽 섬과 등대 → 바위·풀·고양이·야자수 잎 순서로 덧그린다
const W = 224
const H = 140
const HORIZON = 63 // 하늘과 바다의 경계
const SHORE = 101 // 파도가 가장 물러났을 때의 물가
const REACH = 6 // 파도가 모래사장으로 밀려 올라오는 거리
const FPS = 12 // 낮은 프레임이 도트 애니메이션처럼 보인다
const SUN = { x: 174, y: 17, r: 7 }
const LIGHTHOUSE_X = 175
const CAT = { x: 56, y: 98 } // 고양이 그림의 왼쪽 위

// 4×4 Bayer 행렬. 색 띠 경계를 격자무늬로 섞는다(디더링).
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16)

// ImageData를 Uint32Array로 쓰므로 리틀 엔디언 ABGR 순서로 묶는다.
const parse = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
const pack = ([r, g, b]) => (0xff << 24) | (b << 16) | (g << 8) | r
const rgb = (hex) => pack(parse(hex))

// 색 사이를 n단계로 나눈 팔레트. 단계가 촘촘해 디더링한 띠가 부드럽게 이어진다
function gradient(stops, n) {
  const colors = stops.map(parse)
  return Array.from({ length: n }, (_, i) => {
    const t = (i / (n - 1)) * (colors.length - 1)
    const k = Math.min(colors.length - 2, Math.floor(t))
    const f = t - k
    return pack(colors[k].map((v, j) => Math.round(v + (colors[k + 1][j] - v) * f)))
  })
}

const SKY = gradient(['#4c9be9', '#74b4f1', '#a6d0f6', '#d8ecfb'], 12)
const SEA = gradient(['#1257bd', '#1c77d6', '#2995e3', '#3ab2e9', '#66cde8'], 12)
const SEA_LIGHT = rgb('#bfe9f8')
const WHITE = rgb('#ffffff')
const FOAM = rgb('#f6fcff')
const GLINT = rgb('#fff7cf')
const GLINT_SOFT = rgb('#ffe9a3')
const SAND = rgb('#f5e4c1')
const SAND_DARK = rgb('#e3cb9c')
const SAND_LIGHT = rgb('#fff4de')
const WET_SAND = rgb('#e8d1a2')
const WET_GLINT = rgb('#fbefcf')
const SHADOW = rgb('#dcc596')
const SUN_CORE = rgb('#fff6b8')
const SUN_RIM = rgb('#fde68a')
const SUN_GLOW = rgb('#f3f1cf')
const SUN_HALO = rgb('#b9dcf8')
const CLOUD = rgb('#ffffff')
const CLOUD_SHADE = rgb('#dfeafa')
const ISLAND_LIGHT = rgb('#86c06c')
const ISLAND_GREEN = rgb('#4f9655')
const ISLAND_DARK = rgb('#3d7f48')
const CLIFF = rgb('#e6cb9e')
const CLIFF_DARK = rgb('#c8a878')
const LIGHTHOUSE = rgb('#f7f5ef')
const LIGHTHOUSE_SHADE = rgb('#d6d2c8')
const LIGHTHOUSE_RED = rgb('#d8473a')
const ROCK_DARK = rgb('#454b54')
const ROCK = rgb('#646a73')
const ROCK_LIGHT = rgb('#8b9199')
const PALM_DARK = rgb('#2a6634')
const PALM = rgb('#3d8a3f')
const PALM_LIGHT = rgb('#78b552')
const LEAF_DARK = rgb('#3b7d3d')
const LEAF = rgb('#5aa64e')
const LEAF_LIGHT = rgb('#88c866')

// 고양이(뒷모습, 주황 등·흰 옆구리): K 테두리, O 주황, D 진한 주황(그늘), W 흰 털, S 흰 털 그늘, . 투명
const CAT_COLORS = {
  K: rgb('#8e5126'), O: rgb('#f2a14a'), D: rgb('#d8802d'), W: rgb('#ffffff'), S: rgb('#e6e0d6'),
}
const CAT_SPRITE = [
  '........K.........K',
  '.......KOK.......KOK',
  '.......KOOK.....KOOK',
  '.......KOOOKKKKKOOOK',
  '......KOOOOOOOOOOOOOK',
  '......KOOOOOOOOOOOODK',
  '......KOOOOOOOOOOOODK',
  '......KOOOOOOOOOOOODK',
  '.......KOOOOOOOOOODK',
  '........KOOOOOOOODK',
  '.......KOOOOOOOOOODK',
  '......KOOOOOOOOOOOODK',
  '......KWOOOOOOOOOODDK',
  '.....KWWOOOOOOOOOODDWK',
  '.....KWWOOOOOOOOOODDWK',
  '.....KWWWOOOOOOOODDWWK',
  '.....KWWWOOOOOOOODDWWK',
  '.....KWWWWOOOOOODDWWWK',
  '.....KWWWWOOOOOODDWWSK',
  '.....KWWWWWOOOODDWWWSK',
  '.....KSWWWWOOOODWWWSSK',
  '.KK..KSSWWWWOODWWWSSK',
  'KOOKKKKSSWWWWWWWSSKK',
  'KOOOOOOKKKKKKKKKKKK',
  '.KKKKKK',
]

// 뭉게구름: 기준점(아래 가운데)과 동그라미 [dx, dy, 반지름] 목록. 바닥은 기준점 높이에서 평평하게 자른다
const CLOUDS = [
  { x: 72, y: 28, speed: 0.5, puffs: [[-6, 0, 3], [-1, -2, 4], [5, -1, 3], [8, 0, 2]] },
  { x: 62, y: 53, speed: 0.3, puffs: [[-24, 0, 4], [-17, -3, 6], [-8, -8, 8], [2, -6, 7], [11, -4, 6], [20, -1, 4], [27, 0, 3]] },
  { x: 98, y: 41, speed: 0.4, puffs: [[-8, 0, 3], [-3, -4, 5], [3, -6, 5], [8, -1, 3]] },
  { x: 135, y: 49, speed: 0.35, puffs: [[-8, 0, 3], [-3, -2, 4], [3, -2, 4], [8, 0, 3]] },
  { x: 158, y: 45, speed: 0.35, puffs: [[-6, 0, 3], [-1, -2, 4], [5, 0, 3]] },
  { x: 206, y: 40, speed: 0.25, puffs: [[-20, 0, 3], [-13, -3, 5], [-5, -8, 7], [5, -12, 8], [14, -9, 7], [22, -4, 6]] },
  { x: 202, y: 20, speed: 0.45, puffs: [[-3, 0, 2], [1, -1, 3], [4, 0, 2]] },
  { x: 29, y: 45, speed: 0.4, puffs: [[-3, 0, 2], [0, -1, 3], [3, 0, 2]] },
  { x: 107, y: 60, speed: 0.2, puffs: [[-3, 0, 2], [1, -1, 2], [4, 0, 2]] },
  { x: 142, y: 60, speed: 0.2, puffs: [[-7, 0, 2], [-2, -2, 3], [3, -1, 3], [7, 0, 2]] },
]

// 야자수 잎: 왼쪽 위 바깥에서 뻗는 각도(라디안, 0은 오른쪽·양수는 아래), 길이, 처지는 정도
const FRONDS = [
  { angle: 2.3, length: 20, droop: 10 },
  { angle: 2.0, length: 26, droop: 8 },
  { angle: 1.5, length: 34, droop: 8 },
  { angle: 1.75, length: 30, droop: 6 },
  { angle: 1.25, length: 38, droop: 10 },
  { angle: 0.75, length: 44, droop: 18 },
  { angle: 0.55, length: 46, droop: 20 },
  { angle: 0.35, length: 48, droop: 22 },
  { angle: 0.05, length: 40, droop: 20 },
]

// 좌표마다 고정된 0~1 난수 (모래 알갱이·거품·반짝임용)
function hash(x, y, seed) {
  let h = (x * 374761393 + y * 668265263 + seed * 1442695041) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

const dither = (x, y) => BAYER[(y & 3) * 4 + (x & 3)]

// 색 목록에서 t(0~1) 위치의 색을 디더링으로 고른다.
const pick = (colors, t, x, y) => {
  const i = Math.floor(t * (colors.length - 1) + dither(x, y))
  return colors[Math.min(colors.length - 1, Math.max(0, i))]
}

// 캔버스 밖 좌표는 건너뛰고 한 점을 찍는다
const set = (px, x, y, c) => {
  const ix = Math.round(x)
  const iy = Math.round(y)
  if (ix >= 0 && ix < W && iy >= 0 && iy < H) px[iy * W + ix] = c
}

// 물가 모양(굴곡)은 고정, 파도는 시간에 따라 밀려왔다 빠진다. 밀려올 땐 빠르고 빠질 땐 느리다.
const shoreBase = (x) => SHORE + 2 * Math.sin(x * 0.05) + 1.5 * Math.sin(x * 0.021 + 1)
const surge = (x, t) => {
  const s = Math.sin(t * 0.7 - x * 0.015)
  return s > 0 ? Math.sqrt(s) : s * 0.4
}

// 해: 밝은 원 → 노란 테두리 → 연한 빛무리 두 겹 (빛무리는 하늘보다 조금씩 밝다)
function drawSun(px) {
  const R = SUN.r + 6
  for (let y = SUN.y - R; y <= SUN.y + R; y++) {
    for (let x = SUN.x - R; x <= SUN.x + R; x++) {
      const d = Math.hypot(x - SUN.x, y - SUN.y)
      if (d <= SUN.r - 1) set(px, x, y, SUN_CORE)
      else if (d <= SUN.r) set(px, x, y, SUN_RIM)
      else if (d <= SUN.r + 2.5) set(px, x, y, SUN_GLOW)
      else if (d <= R) set(px, x, y, SUN_HALO)
    }
  }
}

// 구름은 천천히 흘러가고 화면 밖으로 나가면 반대편에서 다시 나온다. 아래 두 줄과 오른쪽 아래는 그늘
function drawCloud(px, { x, y, speed, puffs }, t) {
  const span = W + 80
  const cx = ((((x + t * speed + 40) % span) + span) % span) - 40
  for (const [dx, dy, r] of puffs) {
    for (let py = Math.floor(y + dy - r); py <= y; py++) {
      for (let qx = Math.floor(cx + dx - r); qx <= cx + dx + r; qx++) {
        const ox = qx - cx - dx
        const oy = py - y - dy
        if (ox * ox + oy * oy > r * r || py >= HORIZON) continue
        const shade = py >= y - 1 || (ox > r * 0.45 && oy > r * 0.2)
        set(px, qx, py, shade ? CLOUD_SHADE : CLOUD)
      }
    }
  }
}

// 섬 하나: 윤곽 함수 height(x)만큼 수평선 위로 쌓는다. 맨 아래 두 줄 일부는 모래색 절벽
function drawIsland(px, from, to, height) {
  for (let x = from; x < to; x++) {
    const h = Math.round(height(x))
    for (let i = 1; i <= h; i++) {
      const y = HORIZON - i
      let c = i === h ? ISLAND_LIGHT : hash(x, y, 3) > 0.75 ? ISLAND_DARK : ISLAND_GREEN
      if (i <= 2 && hash(x >> 2, i, 4) > 0.4) c = i === 1 ? CLIFF_DARK : CLIFF
      set(px, x, y, c)
    }
  }
}

const leftIsland = (x) => Math.max(0, 7 * (1 - ((x - 16) / 34) ** 2)) + (x > 44 && x < 60 ? 2 : 0) + hash(x >> 1, 0, 6) * 1.2
const rightIsland = (x) => Math.min(14, (x - 149) * 0.45) + Math.sin(x * 0.8) * 0.8 + hash(x >> 1, 0, 7) * 1.5

// 오른쪽 섬 위 등대: 흰 기둥(오른쪽은 그늘)과 빨간 지붕
function drawLighthouse(px) {
  const base = HORIZON - Math.round(rightIsland(LIGHTHOUSE_X)) + 1
  for (let i = 0; i < 11; i++) {
    for (let k = 0; k < 3; k++) {
      const c = i >= 8 ? LIGHTHOUSE_RED : k === 2 ? LIGHTHOUSE_SHADE : LIGHTHOUSE
      set(px, LIGHTHOUSE_X + k, base - i, c)
    }
  }
  set(px, LIGHTHOUSE_X + 1, base - 11, LIGHTHOUSE_RED)
}

// 바위: 아래가 평평한 반타원, 왼쪽 위가 밝다. 물에 잠긴 바위는 밑동에 거품이 인다
function drawRock(px, cx, cy, w, h, frame, wet) {
  for (let y = cy - h; y <= cy; y++) {
    for (let x = cx - w; x <= cx + w; x++) {
      const dx = (x - cx) / w
      const dy = (y - cy) / h
      const d = dx * dx + dy * dy
      if (d > 1) continue
      const light = -dx * 0.6 - (dy + 0.5) * 0.9 + (hash(x, y, 5) - 0.5) * 0.4
      set(px, x, y, d > 0.82 || y === cy ? ROCK_DARK : light > 0.45 ? ROCK_LIGHT : light > -0.2 ? ROCK : ROCK_DARK)
    }
  }
  if (!wet) return
  for (let x = cx - w - 1; x <= cx + w + 1; x++) {
    if (hash(x, cy, frame) > 0.35) set(px, x, cy + 1, FOAM)
  }
}

// 작은 풀: 줄기를 따라 좌우로 번갈아 잎이 난다
function drawSprout(px, x, base, height, sway) {
  for (let i = 0; i < height; i++) {
    const sx = x + sway * (i / height)
    set(px, sx, base - i, LEAF_DARK)
    if (i < 2 || i % 3 !== 0) continue
    const side = (i / 3) % 2 === 0 ? 1 : -1
    const len = 4 - Math.floor((i / height) * 2)
    for (let k = 1; k <= len; k++) {
      set(px, sx + side * k, base - i - Math.floor(k / 2), k === len ? LEAF_LIGHT : LEAF)
      set(px, sx + side * k, base - i - Math.floor(k / 2) + 1, LEAF_DARK)
    }
  }
}

// 왼쪽 아래 큰 잎: 아래에서 위로 뻗는 두꺼운 잎사귀, 끝으로 갈수록 가늘어진다
function drawBlade(px, x0, y0, angle, length, sway) {
  const dx = Math.cos(angle + sway)
  const dy = Math.sin(angle + sway)
  for (let s = 0; s <= length; s += 0.5) {
    const k = s / length
    const half = 2.5 * Math.sin(Math.PI * Math.min(1, k * 1.2 + 0.1))
    for (let w = -half; w <= half; w += 0.5) {
      set(px, x0 + dx * s - dy * w, y0 + dy * s + dx * w, w < -half * 0.3 ? LEAF_LIGHT : w > half * 0.5 ? LEAF_DARK : LEAF)
    }
  }
}

// 야자수 잎 하나: 처지는 잎줄기를 따라 양쪽으로 작은 잎이 아래로 늘어진다. 잎은 끝으로 갈수록 짧아진다
function drawFrond(px, { angle, length, droop }, sway) {
  const dx = Math.cos(angle)
  const dy = Math.sin(angle)
  for (let s = 0; s <= length; s += 0.5) {
    const k = s / length
    const x = 6 + dx * s + sway * k
    const y = -6 + dy * s + droop * k * k
    set(px, x, y, PALM_DARK)
    if (s < 3 || Math.round(s * 2) % 2 !== 0) continue
    const tx = dx
    const ty = dy + (2 * droop * k) / length
    const n = Math.hypot(tx, ty)
    const leaf = 2 + 7 * Math.sin(Math.PI * Math.min(1, k * 1.15)) * (1 - 0.35 * k)
    for (const side of [1, -1]) {
      // 잎줄기에 수직인 방향에서 끝 쪽과 아래쪽(중력)으로 많이 기울인다
      let lx = (-ty / n) * side * 0.6 + (tx / n) * 0.3
      let ly = (tx / n) * side * 0.6 + (ty / n) * 0.3 + 1.0
      const ln = Math.hypot(lx, ly)
      lx /= ln
      ly /= ln
      for (let i = 1; i <= leaf; i++) {
        set(px, x + lx * i, y + ly * i, i > leaf - 2 ? PALM_LIGHT : side > 0 ? PALM : PALM_DARK)
      }
    }
  }
}

// 고양이 뒷모습 스프라이트와 발밑 그림자
function drawCat(px) {
  const bottom = CAT.y + CAT_SPRITE.length
  for (let x = CAT.x + 2; x < CAT.x + 24; x++) {
    set(px, x, bottom - 1, SHADOW)
    if (x > CAT.x + 5 && x < CAT.x + 21) set(px, x, bottom, SHADOW)
  }
  CAT_SPRITE.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const c = CAT_COLORS[row[x]]
      if (c) set(px, CAT.x + x, CAT.y + y, c)
    }
  })
}

function draw(px, t) {
  const frame = Math.floor(t * FPS)

  for (let x = 0; x < W; x++) {
    const base = shoreBase(x)
    const edge = base + REACH * (0.5 + 0.5 * surge(x, t)) // 이 열의 현재 물가
    const wetLine = base + REACH + 2 // 파도가 닿았던 가장 먼 곳까지 젖은 모래
    const sunDx = Math.abs(x - SUN.x)

    for (let y = 0; y < H; y++) {
      let c
      if (y < HORIZON) {
        c = pick(SKY, y / HORIZON, x, y)
      } else if (y < edge) {
        const z = y - HORIZON
        const depth = z / (edge - HORIZON)
        c = pick(SEA, depth, x, y)
        // 잔물결: 짧은 가로 점선이 제각각 천천히 반짝인다(멀수록 짧다)
        const segW = 3 + Math.floor(depth * 3)
        const seg = Math.floor((x + ((y * 7) % segW)) / segW)
        const twinkle = Math.floor(t * 1.5 + hash(seg, y, 11) * 10)
        const n = hash(seg, y, twinkle)
        if (n > 0.9) c = n > 0.97 ? WHITE : SEA_LIGHT
        // 해 아래로 길게 비치는 금빛 물결
        const half = 2 + z * 0.3
        if (sunDx < half && hash(seg, y, twinkle + 50) > 0.3 + (sunDx / half) * 0.6) c = sunDx < half * 0.45 ? GLINT : GLINT_SOFT
        // 물가의 거품
        const toEdge = edge - y
        if (toEdge < 1.2) c = FOAM
        else if (toEdge < 3 && hash(x, y, frame) > 0.5) c = FOAM
      } else if (y < wetLine) {
        c = sunDx < 8 && hash(x, y, frame >> 2) > 0.4 ? WET_GLINT : WET_SAND
      } else {
        const n = hash(x, y, 1)
        const patch = hash(x >> 2, y >> 1, 2)
        c = n > 0.94 || (patch > 0.9 && n > 0.5) ? SAND_DARK : n < 0.04 ? SAND_LIGHT : SAND
        if (sunDx < 6 && y < wetLine + 6 && hash(x, y, 8) > 0.6) c = WET_GLINT
      }
      px[y * W + x] = c
    }
  }

  drawSun(px)
  for (const cloud of CLOUDS) drawCloud(px, cloud, t)
  drawIsland(px, 0, 64, leftIsland)
  drawIsland(px, 149, W, rightIsland)
  drawLighthouse(px)

  // 바위: 물가에 큰 바위 무리, 물속 작은 바위, 오른쪽 아래 모래 위 바위
  drawRock(px, 191, 109, 6, 5, frame, true)
  drawRock(px, 218, 105, 9, 12, frame, true)
  drawRock(px, 205, 108, 12, 13, frame, true)
  drawRock(px, 167, 107, 7, 4, frame, true)
  drawRock(px, 203, 141, 14, 9, frame, false)

  const sway = Math.sin(t * 1.3)
  drawSprout(px, 10, 118, 16, sway * 0.8)
  drawSprout(px, 4, 121, 9, sway * 0.6)
  for (const [x0, angle, length] of [[4, -1.25, 16], [10, -1.0, 13], [20, -1.45, 12], [28, -0.75, 10], [36, -1.2, 8]]) {
    drawBlade(px, x0, H + 1, angle, length, sway * 0.05)
  }
  drawCat(px)
  FRONDS.forEach((frond, i) => drawFrond(px, frond, sway * 1.2 + Math.sin(t * 0.9 + i) * 0.6))
}

export default function PixelBeach() {
  const canvasRef = useRef(null)

  useEffect(() => {
    const ctx = canvasRef.current.getContext('2d')
    const image = ctx.createImageData(W, H)
    const px = new Uint32Array(image.data.buffer)
    const render = (t) => {
      draw(px, t)
      ctx.putImageData(image, 0, 0)
    }

    // 움직임 줄이기 설정이면 파도가 밀려온 순간을 한 장만 그린다.
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      render(2)
      return undefined
    }

    let id
    let last = -Infinity
    const loop = (now) => {
      id = requestAnimationFrame(loop)
      if (now - last < 1000 / FPS) return
      last = now
      render(now / 1000)
    }
    id = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(id)
  }, [])

  return (
    <canvas
      ref={canvasRef}
      width={W}
      height={H}
      role="img"
      aria-label="야자수 잎 아래에서 고양이가 등대 섬이 보이는 바다를 바라보는 해변 도트 그림"
      className="d-block w-100 rounded"
      style={{ aspectRatio: `${W} / ${H}`, imageRendering: 'pixelated' }}
    />
  )
}
