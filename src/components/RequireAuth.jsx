import { Navigate, useLocation } from 'react-router'
import { useAuth } from '../auth/useAuth.js'
import { loginPath } from '../utils/format.js'

// 로그인이 필요한 화면 (기존 @login_required). 로그인하지 않았으면 로그인 화면으로 보낸다.
export default function RequireAuth({ children }) {
  const { user } = useAuth()
  const location = useLocation()
  if (!user) return <Navigate to={loginPath(location)} replace />
  return children
}
