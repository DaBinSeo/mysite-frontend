import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, useLocation, useNavigate } from 'react-router'
import { useAuth } from '../auth/useAuth.js'
import { LLM_MENU_ITEMS } from '../utils/llmSteps.js'

// 드롭다운 메뉴 목록 (화면은 각각 base 경로 아래, 로그인 불필요). header 항목은 묶음 제목이다
const MENUS = [
  { id: 'llm-menu', label: 'LLM', base: '/llm', items: LLM_MENU_ITEMS },
  { id: 'rag-menu', label: 'RAG', base: '/rag', items: [{ to: '/rag/build', label: '데이터 구축 과정 시각화' }] },
]

// public/bootstrap.min.js에는 Popper가 없어 Bootstrap 드롭다운 JS가 동작하지 않으므로 열림 상태를 직접 관리한다.
// 네비게이션바 안의 .dropdown-menu는 CSS만으로 위치가 잡힌다(넓은 화면은 아래로 펼침, 접힌 메뉴는 목록 안에 표시)
function DropdownMenu({ id, label, base, items }) {
  const [open, setOpen] = useState(false)
  const { pathname } = useLocation()
  const [prevPathname, setPrevPathname] = useState(pathname)
  const itemRef = useRef(null)
  const buttonRef = useRef(null)

  // 뒤로 가기 등으로 주소가 바뀌면 닫는다 (렌더링 중 이전 주소와 비교하는 React 권장 방식)
  if (pathname !== prevPathname) {
    setPrevPathname(pathname)
    setOpen(false)
  }

  // 열려 있을 때 메뉴 밖을 누르거나 Esc를 누르면 닫는다. Esc는 포커스를 토글 버튼으로 돌려준다
  useEffect(() => {
    if (!open) return
    const handleClick = (e) => {
      if (!itemRef.current?.contains(e.target)) setOpen(false)
    }
    const handleKey = (e) => {
      if (e.key !== 'Escape') return
      // 바깥 햄버거 메뉴(Navbar)는 이 표시를 보고 같은 Esc로 함께 닫히지 않는다.
      // 캡처 단계로 등록해 Navbar의 리스너보다 항상 먼저 실행된다(등록 순서와 무관)
      e.dropdownHandled = true
      setOpen(false)
      buttonRef.current?.focus()
    }
    document.addEventListener('click', handleClick)
    document.addEventListener('keydown', handleKey, true)
    return () => {
      document.removeEventListener('click', handleClick)
      document.removeEventListener('keydown', handleKey, true)
    }
  }, [open])

  return (
    <li className="nav-item dropdown" ref={itemRef}>
      <button type="button" ref={buttonRef} aria-expanded={open} aria-controls={id}
              className={`nav-link dropdown-toggle ms-auto ms-lg-0 ${pathname === base || pathname.startsWith(`${base}/`) ? 'active' : ''}`}
              onClick={() => setOpen((o) => !o)}>
        {label}
      </button>
      {/* 접힌 메뉴(lg 미만)에서는 다른 메뉴처럼 오른쪽 정렬 */}
      <ul id={id} className={`dropdown-menu text-end text-lg-start ${open ? 'show' : ''}`}>
        {items.map((item) => (item.header ? (
          <li key={`header-${item.header}`}><h6 className="dropdown-header">{item.header}</h6></li>
        ) : (
          <li key={item.to}>
            <NavLink className="dropdown-item" to={item.to} onClick={() => setOpen(false)}>{item.label}</NavLink>
          </li>
        )))}
      </ul>
    </li>
  )
}

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

  // 메뉴 안의 드롭다운이 열려 있으면 Esc는 드롭다운만 닫는다(DropdownMenu가 처리하고 표시를 남김).
  // 화면이 넓어지면(lg 이상) 접힌 메뉴가 없어지므로 닫아 둔다(다시 좁혀도 열린 채 남지 않게)
  useEffect(() => {
    if (!menuOpen) return
    const handleKey = (e) => {
      if (e.key !== 'Escape' || e.dropdownHandled) return
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
      <nav className="navbar navbar-expand-lg navbar-light bg-light border-bottom navbar-overlay">
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
              <li className="nav-item">
                {/* 질문·답변 게시판 (목록·상세·작성 화면 모두 /questions 아래) */}
                <NavLink className="nav-link" to="/questions">Q&amp;A</NavLink>
              </li>
              {MENUS.map((menu) => <DropdownMenu key={menu.id} {...menu} />)}
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
