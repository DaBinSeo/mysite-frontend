// ISO 날짜를 "2026년 10월 16일 오후 2:43" 형태로 표시
export function formatDate(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

// 로그인 화면으로 보낼 때 돌아올 주소를 붙인다
export function loginPath(location) {
  return `/login?next=${encodeURIComponent(location.pathname + location.search + location.hash)}`
}
