import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { api } from '../api/client.js'
import { useAuth } from '../auth/useAuth.js'
import FormErrors from '../components/FormErrors.jsx'

// 답변 수정 (answer_form.html)
export default function AnswerForm() {
  const { id } = useParams()
  const username = useAuth().user?.username
  const navigate = useNavigate()
  const [answer, setAnswer] = useState(null)
  const [content, setContent] = useState('')
  const [error, setError] = useState(null)

  useEffect(() => {
    api.get(`/answers/${id}/`)
      .then((result) => {
        if (result.author !== username) {
          navigate(`/questions/${result.question_id}`, { replace: true, state: { message: '수정권한이 없습니다' } })
          return
        }
        setAnswer(result)
        setContent(result.content)
      })
      .catch(setError)
  }, [id, username, navigate])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    try {
      const saved = await api.put(`/answers/${id}/`, { content })
      navigate(`/questions/${saved.question_id}#answer_${saved.id}`)
    } catch (err) {
      setError(err)
    }
  }

  return (
    <div className="container my-3">
      <form onSubmit={handleSubmit}>
        <FormErrors error={error} labels={{ content: '답변내용' }} />
        <div className="mb-3">
          <label htmlFor="content" className="form-label">답변내용</label>
          <textarea className="form-control" name="content" id="content" rows="10"
                    value={content} onChange={(e) => setContent(e.target.value)} disabled={!answer} />
        </div>
        <button type="submit" className="btn btn-primary" disabled={!answer}>저장하기</button>
      </form>
    </div>
  )
}
