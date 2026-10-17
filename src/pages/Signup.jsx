import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { api } from '../api/client.js'
import { useAuth } from '../auth/useAuth.js'
import FormErrors from '../components/FormErrors.jsx'

const LABELS = { username: '사용자 이름', password1: '비밀번호', password2: '비밀번호 확인', email: '이메일' }

// 회원가입 (signup.html). 비밀번호 조건은 서버의 AUTH_PASSWORD_VALIDATORS 문구를 받아 표시
export default function Signup() {
  const { signup } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState({ username: '', password1: '', password2: '', email: '' })
  const [rules, setRules] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    api.get('/auth/password-rules/').then(setRules).catch(() => {})
  }, [])

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value })

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    try {
      await signup(form)
      navigate('/') // 가입하면 바로 로그인 상태
    } catch (err) {
      setError(err)
      setForm({ ...form, password1: '', password2: '' }) // 비밀번호는 다시 채우지 않는다
    }
  }

  return (
    <div className="container my-3">
      <form onSubmit={handleSubmit}>
        <FormErrors error={error} labels={LABELS} />
        <div className="mb-3">
          <label htmlFor="username">사용자 이름</label>
          <input type="text" className="form-control" name="username" id="username" autoComplete="username"
                 value={form.username} onChange={handleChange} />
        </div>
        <div className="mb-3">
          <label htmlFor="password1">비밀번호</label>
          <input type="password" className="form-control" name="password1" id="password1"
                 autoComplete="new-password" aria-describedby="password1_help"
                 value={form.password1} onChange={handleChange} />
          <div id="password1_help" className="form-text">
            {rules && <ul>{rules.rules.map((rule) => <li key={rule}>{rule}</li>)}</ul>}
          </div>
        </div>
        <div className="mb-3">
          <label htmlFor="password2">비밀번호 확인</label>
          <input type="password" className="form-control" name="password2" id="password2"
                 autoComplete="new-password" aria-describedby="password2_help"
                 value={form.password2} onChange={handleChange} />
          <div id="password2_help" className="form-text">{rules?.confirm_help}</div>
        </div>
        <div className="mb-3">
          <label htmlFor="email">이메일</label>
          <input type="text" className="form-control" name="email" id="email" autoComplete="email"
                 value={form.email} onChange={handleChange} />
        </div>
        <button type="submit" className="btn btn-primary">생성하기</button>
      </form>
    </div>
  )
}
