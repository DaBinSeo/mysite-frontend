import { Link, useNavigate } from 'react-router'

// 404 화면: 없는 경로나 삭제된 질문으로 들어왔을 때
export default function NotFound({
  title = '요청하신 페이지를 찾을 수 없어요',
  message = '주소가 잘못 입력되었거나, 페이지가 이동 또는 삭제되었을 수 있습니다.',
}) {
  const navigate = useNavigate()

  return (
    <div className="container my-5 text-center">
      <div className="display-1 fw-bold text-secondary">404</div>
      <h2 className="my-3">{title}</h2>
      <p className="text-muted">{message}</p>
      <p className="text-muted">입력하신 주소를 다시 확인하시거나, 아래 버튼으로 이동해 주세요.</p>
      <div className="d-flex justify-content-center gap-2 mt-4">
        <Link to="/" className="btn btn-primary">질문 목록으로</Link>
        <button type="button" className="btn btn-outline-secondary" onClick={() => navigate(-1)}>
          이전 페이지로
        </button>
      </div>
    </div>
  )
}
