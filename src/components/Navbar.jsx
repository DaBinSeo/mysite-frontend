import { Link, NavLink, useNavigate } from 'react-router'
import { useAuth } from '../auth/useAuth.js'

// 네비게이션바 (navbar.html)
export default function Navbar() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  const handleLogout = () => {
    logout()
    navigate('/')
  }

  return (
    <nav className="navbar navbar-expand-lg navbar-light bg-light border-bottom">
      <div className="container-fluid">
        <Link className="navbar-brand" to="/">seo</Link>
        <button className="navbar-toggler" type="button"
                data-bs-toggle="collapse"
                data-bs-target="#navbarSupportedContent"
                aria-controls="navbarSupportedContent"
                aria-expanded="false"
                aria-label="Toggle navigation">
          <span className="navbar-toggler-icon"></span>
        </button>
        {/* 접힌 메뉴(lg 미만)는 오른쪽 정렬, 펼친 가로 메뉴는 기본 배치 */}
        <div className="collapse navbar-collapse text-end text-lg-start" id="navbarSupportedContent">
          <ul className="navbar-nav me-auto mb-2 mb-lg-0">
            <li className="nav-item">
              {/* 질문·답변 게시판 (목록·상세·작성 화면 모두 /questions 아래) */}
              <NavLink className="nav-link" to="/questions">Q&amp;A</NavLink>
            </li>
          </ul>
          <ul className="navbar-nav mb-2 mb-lg-0">
            {user ? (
              <li className="nav-item">
                <button type="button" className="nav-link btn btn-link ms-auto ms-lg-0" onClick={handleLogout}>
                  {user.nickname} (로그아웃)
                </button>
              </li>
            ) : (
              <>
                <li className="nav-item">
                  <Link className="nav-link" to="/login">로그인</Link>
                </li>
                <li className="nav-item">
                  <Link className="nav-link" to="/signup">회원가입</Link>
                </li>
              </>
            )}
          </ul>
        </div>
      </div>
    </nav>
  )
}
