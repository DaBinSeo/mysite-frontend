import PixelBeach from '../components/PixelBeach.jsx'
import { useTitle } from '../utils/useTitle.js'

// 첫 화면 (게시판은 네비게이션의 Q&A로 이동)
export default function Home() {
  useTitle('')
  return (
    <div className="container my-3">
      <PixelBeach />
    </div>
  )
}
