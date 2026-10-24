import { Link } from 'react-router'
import PixelBeach from '../components/PixelBeach.jsx'
import { LLM_STEPS } from '../utils/llmSteps.js'
import { RAG_STEPS } from '../utils/ragSteps.js'
import { useTitle } from '../utils/useTitle.js'

// 번호가 있는 단계 수 (시작 화면인 전체 흐름은 빼고 센다)
const stepCount = (steps) => `${steps.filter((s) => s.num).length}단계`

// 첫 화면에서 들어가는 메뉴 (LLM·RAG는 각 메뉴의 전체 흐름 화면으로 간다)
const ENTRIES = [
  {
    to: '/llm', badge: stepCount(LLM_STEPS), title: 'LLM 학습',
    desc: '학습 데이터를 만드는 데서 시작해 사전 학습·정렬·평가·서빙까지, LLM을 만드는 과정을 단계별로 직접 계산해 봅니다.',
    action: '전체 흐름 보기',
  },
  {
    to: '/rag', badge: stepCount(RAG_STEPS), title: 'RAG 실습',
    desc: '문서를 색인하고, 질문에 맞는 근거를 찾아 출처가 달린 답을 만드는 검색 증강 생성 과정을 단계별로 살펴봅니다.',
    action: '전체 흐름 보기',
  },
  {
    to: '/questions', badge: '게시판', title: 'Q&A',
    desc: '공부하다 생긴 궁금한 점을 질문하고, 다른 사람의 답변을 보며 함께 정리합니다.',
    action: '질문 보러 가기',
  },
]

// 첫 화면: 소개 + 해변 그림 → 메뉴 진입 카드
export default function Home() {
  useTitle('')
  return (
    <div className="container my-4">
      <div className="row g-4 align-items-center mb-4">
        <div className="col-12 col-lg-5 home-intro">
          <h1 className="h3 fw-bold mb-3">LLM과 RAG를 직접 계산하며 배우기</h1>
          <p className="text-body-secondary mb-0">
            언어 모델이 만들어지고 검색과 함께 답을 내기까지의 과정을 작은 예제로 하나씩 돌려 봅니다.
            모든 계산은 브라우저에서 하며, 막히는 부분은 Q&amp;A에 물어볼 수 있습니다.
          </p>
        </div>
        <div className="col-12 col-lg-7">
          <PixelBeach />
        </div>
      </div>
      <div className="row g-3">
        {ENTRIES.map((entry) => (
          <div key={entry.to} className="col-12 col-md-4">
            <Link to={entry.to} className="card h-100 text-reset text-decoration-none home-entry">
              <div className="card-body d-flex flex-column">
                <div className="d-flex align-items-center gap-2 mb-2">
                  <h2 className="h5 fw-bold mb-0">{entry.title}</h2>
                  <span className="badge text-bg-light border">{entry.badge}</span>
                </div>
                <p className="small text-body-secondary flex-grow-1">{entry.desc}</p>
                <span className="small fw-bold text-primary">{entry.action} →</span>
              </div>
            </Link>
          </div>
        ))}
      </div>
    </div>
  )
}
