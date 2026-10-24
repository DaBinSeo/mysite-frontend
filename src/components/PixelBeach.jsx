import { useEffect, useRef } from 'react'

// 도트 그래픽 해변. 작은 캔버스(W×H)에 픽셀을 직접 찍고 CSS로 확대해(pixelated) 도트 느낌을 낸다.
// 앞쪽부터 야자수 잎·풀·고양이·바위, 뒤쪽은 파도·등대 섬·구름·해 (Codex 화면 시안의 해변 그림을 따름)
const W = 192
const H = 108
const HORIZON = 40 // 하늘과 바다의 경계
const SHORE = 70 // 파도가 가장 물러났을 때의 물가
const REACH = 12 // 파도가 모래사장으로 밀려 올라오는 거리
const FPS = 12 // 낮은 프레임이 도트 애니메이션처럼 보인다
const SUN = { x: 136, y: 16, r: 7 }
const ISLAND = { from: 146, top: 7 } // 수평선 오른쪽 섬: 시작 x, 가장 높은 곳의 높이
const LIGHTHOUSE_X = 166
const CAT = { x: 80, y: 82 } // 고양이 그림의 왼쪽 위

// 4×4 Bayer 행렬. 색 띠 경계를 격자무늬로 섞는다(디더링).
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16)

// ImageData를 Uint32Array로 쓰므로 리틀 엔디언 ABGR 순서로 묶는다.
const rgb = (hex) => {
  const n = parseInt(hex.slice(1), 16)
  return (0xff << 24) | ((n & 0xff) << 16) | (n & 0xff00) | (n >> 16)
}

const SKY = ['#3a84e2', '#5c9ff0', '#8cc2f6', '#c4e2fb'].map(rgb)
const SEA = ['#145aa8', '#1d76c6', '#2696da', '#35b8e2', '#6ad6e6'].map(rgb)
const SEA_LIGHT = rgb('#a8e6ef')
const FOAM = rgb('#f4fbff')
const SPARKLE = rgb('#fff6c8')
const SAND = rgb('#e9cf94')
const SAND_DARK = rgb('#d4b577')
const SAND_LIGHT = rgb('#f6e3b4')
const WET_SAND = rgb('#c9a96c')
const WET_SAND_DARK = rgb('#b8975c')
const SUN_COLOR = rgb('#fff3b0')
const SUN_GLOW = rgb('#fbe7a1')
const CLOUD = rgb('#ffffff')
const CLOUD_SHADE = rgb('#dbe8f7')
const SHELL = rgb('#f2a7a0')
const ISLAND_LIGHT = rgb('#7cc35e')
const ISLAND_GREEN = rgb('#469447')
const ISLAND_DARK = rgb('#2f6e3b')
const LIGHTHOUSE = rgb('#f7f7f2')
const LIGHTHOUSE_RED = rgb('#d9483b')
const LAMP = rgb('#ffe066')
const PALM_DARK = rgb('#22603a')
const PALM = rgb('#2f8a45')
const PALM_LIGHT = rgb('#5fb85a')
const GRASS_DARK = rgb('#3b7d36')
const GRASS = rgb('#5ea845')
const GRASS_LIGHT = rgb('#8dcc5f')
const ROCK_DARK = rgb('#454b55')
const ROCK = rgb('#646b76')
const ROCK_LIGHT = rgb('#8a929d')
// 고양이(뒷모습): K 테두리, O 주황, D 줄무늬, L 밝은 털, . 투명
const CAT_COLORS = { K: rgb('#6b3a16'), O: rgb('#f39331'), D: rgb('#c9661c'), L: rgb('#ffc074') }
const CAT_SPRITE = [
  '..K.......K.....',
  '.KOK.....KOK....',
  '.KOOK...KOOK....',
  '.KOOOKKKOOOK....',
  'KOOOOOOOOOOOK...',
  'KODOOOOOOODOK...',
  'KOODOOOOODOOK...',
  'KOOOOOOOOOOOK...',
  '.KOOOOOOOOOK....',
  '..KOOOOOOOK.....',
  '.KOOOOOOOOOK....',
  'KOODOOOOODOOK...',
  'KOOODOOODOOOK.K.',
  'KOOOOOOOOOOOKKOK',
  'KOODOOOOODOOKKOK',
  'KOOOOOOOOOOOOOK.',
  'KLOOOOOOOOOOLK..',
  '.KKKKKKKKKKKK...',
]
// 야자수 잎: 왼쪽 위 바깥에서 뻗는 각도(라디안, 0은 오른쪽·양수는 아래), 길이, 처지는 정도
const FRONDS = [
  { angle: -0.2, length: 34, droop: 10 },
  { angle: 0.15, length: 48, droop: 18 },
  { angle: 0.45, length: 44, droop: 16 },
  { angle: 0.8, length: 38, droop: 10 },
  { angle: 1.15, length: 30, droop: 6 },
  { angle: 1.45, length: 22, droop: 3 },
]
const GRASS_TUFTS = [[5, 107], [12, 105], [19, 108], [27, 107], [36, 108], [184, 108]]

const CLOUDS = [
  { x: 20, y: 10, w: 14, h: 4, speed: 1.2 },
  { x: 95, y: 22, w: 10, h: 3, speed: 0.8 },
  { x: 160, y: 27, w: 8, h: 2, speed: 0.5 },
  { x: 60, y: 15, w: 8, h: 3, speed: 1.0 },
  { x: 125, y: 8, w: 6, h: 2, speed: 0.6 },
]
const SHELLS = [[30, 84], [88, 80], [131, 79], [152, 78]] // 파도가 가장 멀리 올 때 잠기는 위치

// 좌표마다 고정된 0~1 난수 (모래 알갱이·거품·반짝임용)
function hash(x, y, seed) {
  let h = (x * 374761393 + y * 668265263 + seed * 1442695041) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

// 색 목록에서 t(0~1) 위치의 색을 디더링으로 고른다.
const pick = (colors, t, x, y) => {
  const i = Math.floor(t * (colors.length - 1) + BAYER[(y & 3) * 4 + (x & 3)])
  return colors[Math.min(colors.length - 1, Math.max(0, i))]
}

const set = (px, x, y, c) => {
  const ix = Math.round(x)
  const iy = Math.round(y)
  if (ix >= 0 && ix < W && iy >= 0 && iy < H) px[iy * W + ix] = c
}

// 섬 윤곽: 가운데가 볼록한 언덕 두 개
const islandHeight = (x) => {
  if (x < ISLAND.from) return 0
  const a = Math.max(0, 1 - ((x - 170) / 20) ** 2)
  const b = Math.max(0, 1 - ((x - 186) / 12) ** 2)
  return Math.round(ISLAND.top * Math.max(a, b * 0.8) + (x - ISLAND.from < 4 ? 1 : 0))
}

// 수평선 위의 섬과 등대 (등대 불빛은 1초 켜지고 1초 꺼진다)
function drawIsland(px, t) {
  for (let x = ISLAND.from; x < W; x++) {
    const h = islandHeight(x)
    for (let i = 1; i <= h; i++) {
      const y = HORIZON - i
      set(px, x, y, i === h ? ISLAND_LIGHT : i <= 1 ? ISLAND_DARK : hash(x, y, 3) > 0.8 ? ISLAND_DARK : ISLAND_GREEN)
    }
  }
  const base = HORIZON - islandHeight(LIGHTHOUSE_X)
  for (let i = 1; i <= 8; i++) {
    const c = i === 3 || i === 6 ? LIGHTHOUSE_RED : LIGHTHOUSE
    set(px, LIGHTHOUSE_X, base - i, c)
    set(px, LIGHTHOUSE_X + 1, base - i, c)
  }
  set(px, LIGHTHOUSE_X, base - 9, LIGHTHOUSE_RED)
  set(px, LIGHTHOUSE_X + 1, base - 9, LIGHTHOUSE_RED)
  if (Math.floor(t) % 2 === 0) {
    set(px, LIGHTHOUSE_X - 1, base - 8, LAMP)
    set(px, LIGHTHOUSE_X + 2, base - 8, LAMP)
  }
}

// 바위: 아래가 평평한 반타원, 왼쪽 위가 밝다
function drawRock(px, cx, cy, w, h) {
  for (let y = cy - h; y <= cy; y++) {
    for (let x = cx - w; x <= cx + w; x++) {
      const dx = (x - cx) / w
      const dy = (y - cy) / h
      if (dx * dx + dy * dy > 1) continue
      const light = -dx * 0.6 - (dy + 0.5) * 0.9 + (hash(x, y, 5) - 0.5) * 0.4
      set(px, x, y, y === cy ? ROCK_DARK : light > 0.45 ? ROCK_LIGHT : light > -0.2 ? ROCK : ROCK_DARK)
    }
  }
}

// 풀 한 포기: 잎 다섯 장이 바람에 조금씩 흔들린다
function drawTuft(px, bx, by, sway) {
  for (let k = -2; k <= 2; k++) {
    const height = 4 + Math.floor(hash(bx, k, 9) * 6)
    const lean = k * 0.5 + sway
    for (let i = 0; i < height; i++) {
      const c = i === height - 1 ? GRASS_LIGHT : i < height / 2 ? GRASS_DARK : GRASS
      set(px, bx + k + lean * (i / height) * 2, by - i, c)
    }
  }
}

// 야자수 잎 하나: 처지는 잎줄기를 따라 양쪽으로 작은 잎을 단다. 잎은 끝으로 갈수록 짧아진다
function drawFrond(px, { angle, length, droop }, sway) {
  const dx = Math.cos(angle)
  const dy = Math.sin(angle)
  for (let s = 0; s <= length; s += 0.5) {
    const k = s / length
    const x = -3 + dx * s
    const y = -3 + dy * s + droop * k * k + sway * k
    set(px, x, y, PALM_DARK)
    if (s < 3 || Math.round(s * 2) % 3 !== 0) continue
    const tx = dx
    const ty = dy + (2 * droop * k + sway) / length
    const n = Math.hypot(tx, ty)
    const leaf = 2 + 8 * Math.sin(Math.PI * Math.min(1, k * 1.15)) * (1 - 0.35 * k)
    for (const side of [1, -1]) {
      // 잎줄기에 수직인 방향에서 끝 쪽과 아래쪽(중력)으로 기울인다
      let lx = (-ty / n) * side * 0.8 + (tx / n) * 0.45
      let ly = (tx / n) * side * 0.8 + (ty / n) * 0.45 + 0.55
      const ln = Math.hypot(lx, ly)
      lx /= ln
      ly /= ln
      for (let i = 1; i <= leaf; i++) {
        set(px, x + lx * i, y + ly * i, i > leaf - 2 ? PALM_LIGHT : side > 0 ? PALM : PALM_LIGHT)
      }
    }
  }
}

// 고양이 뒷모습 스프라이트와 발밑 그림자
function drawCat(px) {
  CAT_SPRITE.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const c = CAT_COLORS[row[x]]
      if (c) set(px, CAT.x + x, CAT.y + y, c)
    }
  })
  // 발밑 그림자
  for (let x = 1; x < 15; x++) set(px, CAT.x + x, CAT.y + CAT_SPRITE.length, SAND_DARK)
}

// 물가 모양(굴곡)은 고정, 파도는 시간에 따라 밀려왔다 빠진다. 밀려올 땐 빠르고 빠질 땐 느리다.
const shoreBase = (x) => SHORE + 2.5 * Math.sin(x * 0.07) + 2 * Math.sin(x * 0.023 + 1)
const surge = (x, t) => {
  const s = Math.sin(t * 0.7 - x * 0.015)
  return s > 0 ? Math.sqrt(s) : s * 0.4
}

function draw(px, t) {
  const frame = Math.floor(t * FPS)
  const sparkleFrame = Math.floor(t * 4)

  for (let x = 0; x < W; x++) {
    const base = shoreBase(x)
    const edge = base + REACH * (0.5 + 0.5 * surge(x, t)) // 이 열의 현재 물가
    const wetLine = base + REACH + 1 // 파도가 닿았던 가장 먼 곳까지 젖은 모래

    for (let y = 0; y < H; y++) {
      let c
      if (y < HORIZON) {
        c = pick(SKY, y / HORIZON, x, y)
      } else if (y < edge) {
        const z = y - HORIZON
        const depth = z / (edge - HORIZON)
        c = pick(SEA, depth, x, y)
        // 물결: 가까울수록 줄 간격이 넓어지고, 시간에 따라 물가 쪽으로 밀려온다.
        const phase = Math.sqrt(z) * 4.2 - t * 2.2 + Math.sin(x * 0.12 + z * 0.4) * 0.8
        if (Math.sin(phase) > 0.93 && hash(x >> 2, y, 7) > 0.25) c = SEA_LIGHT
        // 햇빛이 비치는 기둥에서 반짝임
        if (Math.abs(x - SUN.x) < 4 + z * 0.35 && hash(x, y, sparkleFrame) > 0.9) c = SPARKLE
        // 물가의 거품
        const toEdge = edge - y
        if (toEdge < 1.5) c = FOAM
        else if (toEdge < 3.5 && hash(x, y, frame) > 0.45) c = FOAM
      } else if (y < wetLine) {
        c = y - edge < 1.5 && hash(x, y, frame) > 0.6 ? FOAM : hash(x, y, 1) > 0.85 ? WET_SAND_DARK : WET_SAND
      } else {
        const n = hash(x, y, 1)
        c = n > 0.9 ? SAND_DARK : n < 0.05 ? SAND_LIGHT : SAND
      }
      px[y * W + x] = c
    }
  }

  // 해 (테두리는 디더링으로 번지게)
  for (let y = SUN.y - SUN.r - 3; y <= SUN.y + SUN.r + 3; y++) {
    for (let x = SUN.x - SUN.r - 3; x <= SUN.x + SUN.r + 3; x++) {
      const d = Math.hypot(x - SUN.x, y - SUN.y)
      if (d <= SUN.r) px[y * W + x] = SUN_COLOR
      else if (d <= SUN.r + 2.5 && BAYER[(y & 3) * 4 + (x & 3)] > (d - SUN.r) / 2.5) px[y * W + x] = SUN_GLOW
    }
  }

  drawIsland(px, t)

  // 구름은 천천히 흘러가고 화면 밖으로 나가면 반대편에서 다시 나온다.
  for (const cloud of CLOUDS) {
    const span = W + cloud.w * 4
    const cx = ((cloud.x + t * cloud.speed) % span) - cloud.w * 2
    for (const [ox, oy, s] of [[0, 0, 1], [-cloud.w * 0.6, 1, 0.65], [cloud.w * 0.7, 1, 0.55]]) {
      const w = cloud.w * s
      const h = cloud.h * s + 1
      for (let y = Math.floor(cloud.y + oy - h); y <= cloud.y + oy + 1; y++) {
        for (let x = Math.floor(cx + ox - w); x <= cx + ox + w; x++) {
          if (x < 0 || x >= W || y < 0) continue
          const dx = (x - cx - ox) / w
          const dy = (y - cloud.y - oy) / h
          if (dx * dx + dy * dy <= 1) {
            px[y * W + x] = y >= cloud.y + oy ? CLOUD_SHADE : CLOUD
          }
        }
      }
    }
  }

  // 조개껍데기 (파도가 덮으면 가려진다)
  for (const [sx, sy] of SHELLS) {
    if (sy < shoreBase(sx) + REACH * (0.5 + 0.5 * surge(sx, t))) continue
    px[sy * W + sx] = SHELL
    px[sy * W + sx + 1] = SHELL
  }

  // 앞쪽 소품: 물가 바위(파도 위로 드러남)·모래 위 바위, 풀, 고양이, 야자수 잎
  drawRock(px, 181, 75, 11, 8)
  drawRock(px, 168, 77, 5, 4)
  drawRock(px, 170, 104, 10, 7)
  drawRock(px, 157, 104, 4, 3)
  const sway = Math.sin(t * 1.3)
  for (const [gx, gy] of GRASS_TUFTS) drawTuft(px, gx, gy, sway * 0.4)
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

    // 움직임 줄이기 설정이면 한 장만 그린다.
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      render(0)
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
