import { useEffect } from 'react'

const SITE_NAME = 'seo'

// 화면별 문서 제목(검색 결과·브라우저 탭에 보인다). 빈 값이면 사이트 이름만,
// null이면 건드리지 않는다(하위 ErrorPage가 제목을 정할 때)
export function useTitle(title) {
  useEffect(() => {
    if (title === null) return
    document.title = title ? `${title} | ${SITE_NAME}` : SITE_NAME
  }, [title])
}
