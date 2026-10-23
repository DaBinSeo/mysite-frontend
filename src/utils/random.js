// 같은 시드면 늘 같은 결과를 내는 난수 (LLM·RAG 시각화 공용)

// mulberry32: 0 이상 1 미만의 난수를 내는 함수를 돌려준다
export function makeRng(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
