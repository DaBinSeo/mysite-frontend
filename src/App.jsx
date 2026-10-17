import { useEffect, useState } from 'react'

function App() {
  const [questions, setQuestions] = useState([])
  const [error, setError] = useState(null)

  useEffect(() => {
    // 게이트웨이(localhost:8080)를 거치므로 같은 출처의 상대 경로로 호출한다.
    fetch('/api/questions/')
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json()
      })
      .then((data) => setQuestions(data.questions))
      .catch((err) => setError(err.message))
  }, [])

  return (
    <main style={{ maxWidth: 720, margin: '40px auto', padding: '0 16px', textAlign: 'left' }}>
      <h1>Pybo 질문 목록 (React)</h1>
      {error && <p style={{ color: 'crimson' }}>불러오기 실패: {error}</p>}
      <ul>
        {questions.map((q) => (
          <li key={q.id}>
            <a href={`/pybo/${q.id}/`}>{q.subject}</a>{' '}
            <small>
              {q.author} · {new Date(q.create_date).toLocaleString('ko-KR')}
            </small>
          </li>
        ))}
      </ul>
    </main>
  )
}

export default App
