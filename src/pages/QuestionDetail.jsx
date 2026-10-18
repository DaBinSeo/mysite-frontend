import { useCallback, useEffect, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router'
import { api } from '../api/client.js'
import { useAuth } from '../auth/useAuth.js'
import FormErrors from '../components/FormErrors.jsx'
import MarkdownEditor from '../components/MarkdownEditor.jsx'
import { formatDate, loginPath } from '../utils/format.js'
import ErrorPage from './ErrorPage.jsx'

// 작성자·작성일시·수정일시 표시
function Dates({ item }) {
  return (
    <div className="d-flex justify-content-end">
      {item.modify_date && (
        <div className="badge bg-light text-dark p-2 text-start mx-3">
          <div className="mb-2">modified at</div>
          <div>{formatDate(item.modify_date)}</div>
        </div>
      )}
      <div className="badge bg-light text-dark p-2 text-start">
        <div className="mb-2">{item.author}</div>
        <div>{formatDate(item.create_date)}</div>
      </div>
    </div>
  )
}

// 추천·수정·삭제 버튼 (수정·삭제는 작성자에게만)
function Actions({ item, isAuthor, editPath, onVote, onDelete }) {
  return (
    <div className="my-3">
      <button type="button" className="btn btn-sm btn-outline-secondary me-1" onClick={onVote}>
        추천 <span className="badge rounded-pill bg-success">{item.voter_count}</span>
      </button>
      {isAuthor && (
        <>
          <Link to={editPath} className="btn btn-sm btn-outline-secondary me-1">수정</Link>
          <button type="button" className="btn btn-sm btn-outline-secondary" onClick={onDelete}>삭제</button>
        </>
      )}
    </div>
  )
}

// 질문 상세 + 답변 목록·등록 (question_detail.html)
export default function QuestionDetail() {
  const { id } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [question, setQuestion] = useState(null)
  const [loadError, setLoadError] = useState(null)
  const [message, setMessage] = useState(location.state?.message ?? null) // 권한 오류 등 (기존 messages)
  const [content, setContent] = useState('')
  const [answerError, setAnswerError] = useState(null)

  // 답변 등록·삭제 후 다시 불러올 때 사용
  const load = useCallback(() => api.get(`/questions/${id}/`).then(setQuestion), [id])

  // 질문이 바뀌면 다시 불러온다. 이전 오류는 지우고, 늦게 도착한 이전 질문의 응답은 무시한다
  useEffect(() => {
    let ignore = false
    api.get(`/questions/${id}/`)
      .then((result) => {
        if (ignore) return
        setQuestion(result)
        setLoadError(null)
      })
      .catch((err) => {
        if (!ignore) setLoadError(err)
      })
    return () => {
      ignore = true
    }
  }, [id])

  // #answer_<id>로 들어오면 해당 답변 위치로 이동
  useEffect(() => {
    if (question && location.hash) document.getElementById(location.hash.slice(1))?.scrollIntoView()
  }, [question, location.hash])

  // 요청 실패 처리: 로그인이 필요하면 로그인 화면으로, 그 밖에는 위쪽에 경고 표시
  const run = async (action) => {
    setMessage(null)
    try {
      await action()
    } catch (err) {
      if (err.status === 401) navigate(loginPath(location))
      else setMessage(err.message)
    }
  }

  const voteQuestion = () => {
    if (!window.confirm('정말로 추천하시겠습니까?')) return
    run(async () => {
      const { voter_count } = await api.post(`/questions/${id}/vote/`)
      setQuestion((q) => ({ ...q, voter_count }))
    })
  }

  const deleteQuestion = () => {
    if (!window.confirm('정말로 삭제하시겠습니까?')) return
    run(async () => {
      await api.delete(`/questions/${id}/`)
      navigate('/')
    })
  }

  const voteAnswer = (answer) => {
    if (!window.confirm('정말로 추천하시겠습니까?')) return
    run(async () => {
      const { voter_count } = await api.post(`/answers/${answer.id}/vote/`)
      setQuestion((q) => ({
        ...q,
        answers: q.answers.map((a) => (a.id === answer.id ? { ...a, voter_count } : a)),
      }))
    })
  }

  const deleteAnswer = (answer) => {
    if (!window.confirm('정말로 삭제하시겠습니까?')) return
    run(async () => {
      await api.delete(`/answers/${answer.id}/`)
      await load()
    })
  }

  const submitAnswer = async (e) => {
    e.preventDefault()
    setAnswerError(null)
    try {
      const answer = await api.post(`/questions/${id}/answers/`, { content })
      setContent('')
      await load()
      navigate({ hash: `answer_${answer.id}` }) // 등록한 답변 위치로 이동
    } catch (err) {
      if (err.status === 401) navigate(loginPath(location))
      else setAnswerError(err)
    }
  }

  if (loadError?.status === 404) {
    return <ErrorPage status={404} title="질문을 찾을 수 없어요" message="삭제되었거나 존재하지 않는 질문입니다." />
  }
  if (loadError) return <ErrorPage status={loadError.status} />
  if (!question) return <div className="container my-3">불러오는 중...</div>

  return (
    <div className="container my-3">
      {/* message 표시 */}
      {message && (
        <div className="alert alert-danger my-3" role="alert">
          <strong>error</strong>
          <ul><li>{message}</li></ul>
        </div>
      )}
      {/* 질문 */}
      <h2 className="border-bottom py-2">{question.subject}</h2>
      <div className="card my-3">
        <div className="card-body">
          {/* content_html은 서버에서 nh3로 정리한 HTML */}
          <div className="card-text" dangerouslySetInnerHTML={{ __html: question.content_html }} />
          <Dates item={question} />
          <Actions item={question} isAuthor={user?.username === question.author}
                   editPath={`/questions/${question.id}/edit`}
                   onVote={voteQuestion} onDelete={deleteQuestion} />
        </div>
      </div>
      {/* 답변 */}
      <h5 className="border-bottom my-3 py-2">{question.answer_count}개의 답변이 있습니다.</h5>
      {question.answers.map((answer) => (
        <div className="card my-3" key={answer.id} id={`answer_${answer.id}`}>
          <div className="card-body">
            <div className="card-text" dangerouslySetInnerHTML={{ __html: answer.content_html }} />
            <Dates item={answer} />
            <Actions item={answer} isAuthor={user?.username === answer.author}
                     editPath={`/answers/${answer.id}/edit`}
                     onVote={() => voteAnswer(answer)} onDelete={() => deleteAnswer(answer)} />
          </div>
        </div>
      ))}
      {/* 답변 등록 */}
      <form onSubmit={submitAnswer} className="my-3">
        <FormErrors error={answerError} labels={{ content: '답변내용' }} />
        <div className="mb-3">
          <MarkdownEditor id="content" value={content} onChange={setContent} disabled={!user} />
        </div>
        <input type="submit" value="답변등록" className="btn btn-primary" />
      </form>
    </div>
  )
}
