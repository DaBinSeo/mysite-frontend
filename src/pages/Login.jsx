import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { useAuth } from '../auth/useAuth.js'
import FormErrors from '../components/FormErrors.jsx'
import { useTitle } from '../utils/useTitle.js'

// 로그인 (login.html). 성공하면 next(로그인 전에 보던 화면)로 이동
export default function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  useTitle('로그인')

  const next = searchParams.get('next')
  const target = next?.startsWith('/') && !next.startsWith('//') ? next : '/' // 외부 주소로는 이동하지 않는다

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    try {
      await login(username, password)
      navigate(target, { replace: true })
    } catch (err) {
      setError(err)
      setPassword('') // 실패해도 비밀번호는 다시 채우지 않는다
    }
  }

  return (
    <div className="container my-3">
      <form onSubmit={handleSubmit}>
        <FormErrors error={error} labels={{ username: '사용자ID', password: '비밀번호' }} />
        <div className="mb-3">
          <label htmlFor="username">사용자ID</label>
          <input type="text" className="form-control" name="username" id="username" autoComplete="username"
                 value={username} onChange={(e) => setUsername(e.target.value)} />
        </div>
        <div className="mb-3">
          <label htmlFor="password">비밀번호</label>
          <input type="password" className="form-control" name="password" id="password"
                 autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        <button type="submit" className="btn btn-primary">로그인</button>
      </form>
    </div>
  )
}
