import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { api } from '../api/client.js'
import Pagination from '../components/Pagination.jsx'
import { formatDate } from '../utils/format.js'
import ErrorPage from './ErrorPage.jsx'
import { useTitle } from '../utils/useTitle.js'

// 질문 목록 (question_list.html). 검색어와 페이지는 URL 쿼리(?kw=&page=)로 유지한다.
export default function QuestionList() {
  const [searchParams, setSearchParams] = useSearchParams()
  const kw = searchParams.get('kw') ?? ''
  const page = Number(searchParams.get('page')) || 1
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  useTitle(error ? null : kw ? `'${kw}' 검색` : '질문 목록')

  useEffect(() => {
    let ignore = false
    const params = new URLSearchParams({ page: String(page) })
    if (kw) params.set('kw', kw)
    api.get(`/questions/?${params}`)
      .then((result) => {
        if (ignore) return
        setData(result)
        setError(null)
      })
      .catch((err) => {
        if (!ignore) setError(err)
      })
    return () => {
      ignore = true
    }
  }, [page, kw])

  const go = (nextPage, nextKw = kw) => {
    const params = {}
    if (nextKw) params.kw = nextKw
    if (nextPage > 1) params.page = String(nextPage)
    setSearchParams(params)
  }

  const handleSearch = (e) => {
    e.preventDefault()
    go(1, new FormData(e.currentTarget).get('kw').trim()) // 검색하면 1페이지부터 조회한다.
  }

  if (error) return <ErrorPage status={error.status} />

  return (
    <div className="container my-3">
      {/* 등록 버튼은 오른쪽. 모바일에서는 버튼을 위에 쌓고, md 이상에서는 검색창 왼쪽·버튼 오른쪽 */}
      <div className="row g-2 my-3">
        <div className="col-12 col-md-6 order-md-2 text-end">
          <Link to="/questions/new" className="btn btn-primary">질문 등록하기</Link>
        </div>
        <div className="col-12 col-md-6 order-md-1">
          <form onSubmit={handleSearch} key={kw}>
            <div className="input-group">
              <input type="text" name="kw" className="form-control" defaultValue={kw} aria-label="검색어" />
              <button className="btn btn-outline-secondary" type="submit">찾기</button>
            </div>
          </form>
        </div>
      </div>
      {/* 좁은 화면(md 미만)에서는 제목 열만 남기고 글쓴이·작성일시는 제목 아래에 작게 표시한다 */}
      <table className="table">
        <thead>
          <tr className="text-center table-dark">
            <th className="d-none d-md-table-cell">번호</th>
            <th className="question-subject">제목</th>
            <th className="d-none d-md-table-cell">글쓴이</th>
            <th className="d-none d-md-table-cell">작성일시</th>
          </tr>
        </thead>
        <tbody>
          {data?.results.length ? (
            data.results.map((question, index) => (
              <tr className="text-center" key={question.id}>
                {/* 번호 = 전체건수 - 시작인덱스 - 현재인덱스 + 1 */}
                <td className="d-none d-md-table-cell">{data.count - data.start_index - index + 1}</td>
                <td className="text-start text-break">
                  <Link to={`/questions/${question.id}`}>{question.subject}</Link>
                  {question.answer_count > 0 && (
                    <span className="text-danger small mx-2">{question.answer_count}</span>
                  )}
                  <div className="d-md-none small text-body-secondary">
                    {question.author} · {formatDate(question.create_date)}
                  </div>
                </td>
                <td className="d-none d-md-table-cell text-nowrap">{question.author}</td>
                <td className="d-none d-md-table-cell text-nowrap">{formatDate(question.create_date)}</td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan="4">{data ? '질문이 없습니다.' : '불러오는 중...'}</td>
            </tr>
          )}
        </tbody>
      </table>
      {data && <Pagination page={data.page} numPages={data.num_pages} onChange={(n) => go(n)} />}
    </div>
  )
}
