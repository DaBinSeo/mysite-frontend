import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { api } from '../api/client.js'
import { useAuth } from '../auth/useAuth.js'
import FormErrors from '../components/FormErrors.jsx'
import MarkdownEditor from '../components/MarkdownEditor.jsx'
import ErrorPage from './ErrorPage.jsx'

const LABELS = { subject: '제목', content: '내용' }

// 질문 등록·수정 (question_form.html). /questions/new 는 등록, /questions/:id/edit 는 수정
export default function QuestionForm() {
  const { id } = useParams()
  const editing = Boolean(id)
  const username = useAuth().user?.username
  const navigate = useNavigate()
  const [form, setForm] = useState({ subject: '', content: '' })
  const [error, setError] = useState(null)
  const [loadError, setLoadError] = useState(null) // 수정할 질문 불러오기 실패

  useEffect(() => {
    if (!editing) return
    api.get(`/questions/${id}/`)
      .then((question) => {
        if (question.author !== username) {
          navigate(`/questions/${id}`, { replace: true, state: { message: '수정권한이 없습니다.' } })
          return
        }
        setForm({ subject: question.subject, content: question.content })
      })
      .catch(setLoadError)
  }, [editing, id, username, navigate])

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value })

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    try {
      const question = editing
        ? await api.put(`/questions/${id}/`, form)
        : await api.post('/questions/', form)
      navigate(editing ? `/questions/${question.id}` : '/')
    } catch (err) {
      setError(err)
    }
  }

  if (loadError) {
    return <ErrorPage status={loadError.status} {...(loadError.status === 404 && { title: '질문을 찾을 수 없어요' })} />
  }

  return (
    <div className="container">
      <h5 className="my-3 border-bottom pb-2">{editing ? '질문수정' : '질문등록'}</h5>
      <form onSubmit={handleSubmit}>
        <FormErrors error={error} labels={LABELS} />
        <div className="mb-3">
          <label htmlFor="subject" className="form-label">제목</label>
          <input type="text" className="form-control" name="subject" id="subject"
                 value={form.subject} onChange={handleChange} />
        </div>
        <div className="mb-3">
          <label htmlFor="content" className="form-label">내용</label>
          <MarkdownEditor id="content" value={form.content}
                          onChange={(content) => setForm((f) => ({ ...f, content }))} />
        </div>
        <button type="submit" className="btn btn-primary">저장하기</button>
      </form>
    </div>
  )
}
