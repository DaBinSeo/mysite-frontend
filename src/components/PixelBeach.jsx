import { useEffect, useRef } from 'react'

// 도트 그래픽 해변. 작은 캔버스(W×H)에 픽셀을 직접 찍고 CSS로 확대해(pixelated) 도트 느낌을 낸다.
const W = 192
const H = 108
const HORIZON = 40 // 하늘과 바다의 경계
const SHORE = 70 // 파도가 가장 물러났을 때의 물가
const REACH = 12 // 파도가 모래사장으로 밀려 올라오는 거리
const FPS = 12 // 낮은 프레임이 도트 애니메이션처럼 보인다
const SUN = { x: 150, y: 17, r: 7 }

// 4×4 Bayer 행렬. 색 띠 경계를 격자무늬로 섞는다(디더링).
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16)

// ImageData를 Uint32Array로 쓰므로 리틀 엔디언 ABGR 순서로 묶는다.
const rgb = (hex) => {
  const n = parseInt(hex.slice(1), 16)
  return (0xff << 24) | ((n & 0xff) << 16) | (n & 0xff00) | (n >> 16)
}

const SKY = ['#4a7fd4', '#6c9de6', '#93bdf0', '#c3dcf5'].map(rgb)
const SEA = ['#1d4f91', '#246aad', '#2f8bc4', '#3fb0d4', '#6fd0dc'].map(rgb)
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

const CLOUDS = [
  { x: 20, y: 10, w: 14, h: 4, speed: 1.2 },
  { x: 95, y: 22, w: 10, h: 3, speed: 0.8 },
  { x: 160, y: 30, w: 8, h: 2, speed: 0.5 },
]
const SHELLS = [[30, 84], [88, 80], [131, 79], [172, 77]] // 파도가 가장 멀리 올 때 잠기는 위치

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
      aria-label="파도가 밀려오는 모래사장 도트 그림"
      className="d-block w-100 rounded"
      style={{ aspectRatio: `${W} / ${H}`, imageRendering: 'pixelated' }}
    />
  )
}
