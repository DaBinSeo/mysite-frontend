import { useTitle } from '../utils/useTitle.js'

// 첫 화면 (기능은 추후 개발, 게시판은 네비게이션의 Q&A로 이동)
export default function Home() {
  useTitle('')
  return <div className="container my-3" />
}
