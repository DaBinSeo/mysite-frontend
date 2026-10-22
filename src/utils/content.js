// 본문 최대 글자 수 (backend pybo/models.py의 CONTENT_MAX_LENGTH와 같은 값)
export const CONTENT_MAX_LENGTH = 10000

// 서버(파이썬 len)처럼 문자 단위로 센다. string.length는 이모지 등을 2자로 센다
export function contentLength(value) {
  return Array.from(value).length
}

// 등록 전 확인: 제한을 넘으면 알림을 띄우고 false
export function checkContentLength(value) {
  const length = contentLength(value)
  if (length <= CONTENT_MAX_LENGTH) return true
  window.alert(`내용은 ${CONTENT_MAX_LENGTH.toLocaleString()}자까지 쓸 수 있습니다. (현재 ${length.toLocaleString()}자)`)
  return false
}
