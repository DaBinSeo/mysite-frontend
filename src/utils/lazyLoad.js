import { lazy } from 'react'

// 처음 그릴 때만 내려받는 컴포넌트(코드 분할).
// 배포로 예전 청크 파일이 사라져 받기에 실패하면 새 index.html을 받도록 새로고침한다.
// 새로고침한 지 RELOAD_WINDOW_MS 안에 또 실패하면 파일 문제가 아니라고 보고 오류 화면을 보여 준다(무한 새로고침 방지)
const RELOAD_KEY = 'pybo.chunk-reload'
const RELOAD_WINDOW_MS = 10_000

function shouldReload() {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_KEY)) || 0
    if (Date.now() - last < RELOAD_WINDOW_MS) return false
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()))
    return true
  } catch {
    return false // 저장소를 못 쓰면 횟수를 셀 수 없으니 새로고침하지 않는다
  }
}

export function lazyWithReload(load) {
  return lazy(() => load().catch((error) => {
    if (!shouldReload()) throw error
    window.location.reload()
    return new Promise(() => {}) // 새로고침될 때까지 로딩 화면을 유지해 오류 화면이 깜빡이지 않게 한다
  }))
}
