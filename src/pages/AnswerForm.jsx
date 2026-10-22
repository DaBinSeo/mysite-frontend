import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { api } from '../api/client.js'
import { useAuth } from '../auth/useAuth.js'
import FormErrors from '../components/FormErrors.jsx'
import MarkdownEditor from '../components/MarkdownEditor.jsx'
import ErrorPage from './ErrorPage.jsx'
import { checkContentLength } from '../utils/content.js'
import { useTitle } from '../utils/useTitle.js'

// 답변 수정 (answer_form.html)
export default function AnswerForm() {
  const { id } = useParams()
  const userId = useAuth().user?.id
  const navigate = useNavigate()
  const [answer, setAnswer] = useState(null)
  const [content, setContent] = useState('')
  const [error, setError] = useState(null)
  const [loadError, setLoadError] = useState(null) // 수정할 답변 불러오기 실패
  useTitle(loadError ? null : '답변 수정')

  useEffect(() => {
    api.get(`/answers/${id}/`)
      .then((result) => {
        if (result.author_id !== userId) {
          navigate(`/questions/${result.question_id}`, { replace: true, state: { message: '수정권한이 없습니다' } })
          return
        }
        setAnswer(result)
        setContent(result.content)
      })
      .catch(setLoadError)
  }, [id, userId, navigate])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!checkContentLength(content)) return
    setError(null)
    try {
      const saved = await api.put(`/answers/${id}/`, { content })
      navigate(`/questions/${saved.question_id}#answer_${saved.id}`)
    } catch (err) {
      setError(err)
    }
  }

  if (loadError) {
    return <ErrorPage status={loadError.status} {...(loadError.status === 404 && { title: '답변을 찾을 수 없어요' })} />
  }

  return (
    <div className="container my-3">
      <form onSubmit={handleSubmit}>
        <FormErrors error={error} labels={{ content: '답변내용' }} />
        <div className="mb-3">
          <label htmlFor="content" className="form-label">답변내용</label>
          <MarkdownEditor id="content" value={content} onChange={setContent} disabled={!answer} />
        </div>
        <button type="submit" className="btn btn-primary" disabled={!answer}>저장하기</button>
      </form>
    </div>
  )
}
