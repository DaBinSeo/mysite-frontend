import { Link, useNavigate } from 'react-router'

// 상태 코드별 기본 문구 [제목, 설명]. 0은 서버에 연결하지 못한 경우(네트워크 오류)
const MESSAGES = {
  0: ['서버에 연결할 수 없어요', '인터넷 연결을 확인하시거나 잠시 후 다시 시도해 주세요.'],
  400: ['잘못된 요청이에요', '요청 내용을 다시 확인해 주세요.'],
  403: ['접근 권한이 없어요', '이 페이지를 볼 수 있는 권한이 없습니다.'],
  404: ['요청하신 페이지를 찾을 수 없어요', '주소가 잘못 입력되었거나, 페이지가 이동 또는 삭제되었을 수 있습니다.'],
  500: ['서버에 문제가 생겼어요', '일시적인 오류입니다. 잠시 후 다시 시도해 주세요.'],
  502: ['서비스에 연결할 수 없어요', '서버가 점검 중이거나 응답하지 않습니다. 잠시 후 다시 시도해 주세요.'],
}
MESSAGES[503] = MESSAGES[504] = MESSAGES[502]

// 오류 화면: 상태 코드(404, 500 …)를 크게 보여 주고 이동 버튼을 둔다. title·message로 문구를 바꿀 수 있다
export default function ErrorPage({ status = 500, title, message }) {
  const navigate = useNavigate()
  const retryable = !status || status >= 500 // 서버·네트워크 오류는 다시 시도하면 될 수 있다
  const [defaultTitle, defaultMessage] =
    MESSAGES[status ?? 0] ?? (status >= 500 ? MESSAGES[500] : MESSAGES[400])

  return (
    <div className="container my-5 text-center">
      <div className="display-1 fw-bold text-secondary">{status || '!'}</div>
      <h2 className="my-3">{title ?? defaultTitle}</h2>
      <p className="text-muted">{message ?? defaultMessage}</p>
      <p className="text-muted">
        {status === 404 ? '입력하신 주소를 다시 확인하시거나, 아래 버튼으로 이동해 주세요.'
          : retryable ? '문제가 계속되면 잠시 후 다시 접속해 주세요.'
          : '아래 버튼으로 이동해 주세요.'}
      </p>
      <div className="d-flex justify-content-center gap-2 mt-4">
        <Link to="/" className="btn btn-primary">질문 목록으로</Link>
        <button type="button" className="btn btn-outline-secondary" onClick={() => navigate(-1)}>
          이전 페이지로
        </button>
        {retryable && (
          <button type="button" className="btn btn-outline-secondary" onClick={() => window.location.reload()}>
            다시 시도
          </button>
        )}
      </div>
    </div>
  )
}
