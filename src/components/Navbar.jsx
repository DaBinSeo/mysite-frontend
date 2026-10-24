import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, useLocation, useNavigate } from 'react-router'
import { useAuth } from '../auth/useAuth.js'

// 주요 메뉴. LLM·RAG의 단계는 각 화면 왼쪽 단계 메뉴(VizStage.jsx)에서 고른다.
// NavLink는 하위 경로(/llm/attention 등)에서도 active로 표시된다
const MENUS = [
  { to: '/llm', label: 'LLM' },
  { to: '/rag', label: 'RAG' },
  { to: '/questions', label: 'Q&A' },
]

// 네비게이션바 (navbar.html)
// 좁은 화면(lg 미만)의 햄버거 메뉴는 본문을 밀어내지 않고 본문 위에 겹쳐 연다(.navbar-overlay, public/style.css).
// 열림 상태는 직접 관리한다: 주소가 바뀌거나 링크를 누르거나 배경·Esc를 누르면 닫는다
export default function Navbar() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)
  const { pathname } = useLocation()
  const [prevPathname, setPrevPathname] = useState(pathname)
  const togglerRef = useRef(null)

  if (pathname !== prevPathname) {
    setPrevPathname(pathname)
    setMenuOpen(false)
  }

  // Esc를 누르면 닫고 포커스를 햄버거 버튼으로 돌려준다.
  // 화면이 넓어지면(lg 이상) 접힌 메뉴가 없어지므로 닫아 둔다(다시 좁혀도 열린 채 남지 않게)
  useEffect(() => {
    if (!menuOpen) return
    const handleKey = (e) => {
      if (e.key !== 'Escape') return
      setMenuOpen(false)
      togglerRef.current?.focus()
    }
    const wide = window.matchMedia('(min-width: 992px)')
    const handleWide = (e) => {
      if (e.matches) setMenuOpen(false)
    }
    document.addEventListener('keydown', handleKey)
    wide.addEventListener('change', handleWide)
    return () => {
      document.removeEventListener('keydown', handleKey)
      wide.removeEventListener('change', handleWide)
    }
  }, [menuOpen])

  // 지금 보고 있는 화면의 링크를 눌러 주소가 그대로여도 메뉴를 닫는다
  const handleMenuClick = (e) => {
    if (e.target.closest('a')) setMenuOpen(false)
  }

  const handleLogout = () => {
    setMenuOpen(false)
    logout()
    navigate('/')
  }

  return (
    <>
      <nav className="navbar navbar-expand-lg bg-body border-bottom navbar-overlay">
        <div className="container-fluid">
          <Link className="navbar-brand" to="/">seo</Link>
          <button className="navbar-toggler" type="button" ref={togglerRef}
                  aria-controls="navbarSupportedContent"
                  aria-expanded={menuOpen}
                  aria-label="Toggle navigation"
                  onClick={() => setMenuOpen((o) => !o)}>
            <span className="navbar-toggler-icon"></span>
          </button>
          {/* 접힌 메뉴(lg 미만)는 오른쪽 정렬, 펼친 가로 메뉴는 기본 배치 */}
          <div className={`collapse navbar-collapse text-end text-lg-start ${menuOpen ? 'show' : ''}`}
               id="navbarSupportedContent" onClick={handleMenuClick}>
            <ul className="navbar-nav me-auto mb-2 mb-lg-0">
              {MENUS.map((menu) => (
                <li key={menu.to} className="nav-item">
                  <NavLink className="nav-link" to={menu.to}>{menu.label}</NavLink>
                </li>
              ))}
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
      {/* 접힌 메뉴가 열렸을 때만 본문을 어둡게 덮고, 누르면 닫는다 (넓은 화면에서는 숨김) */}
      {menuOpen && <div className="navbar-backdrop d-lg-none" aria-hidden="true" onClick={() => setMenuOpen(false)} />}
    </>
  )
}
