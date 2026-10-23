import { Suspense } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import Navbar from './components/Navbar.jsx'
import RequireAuth from './components/RequireAuth.jsx'
import AnswerForm from './pages/AnswerForm.jsx'
import ErrorPage from './pages/ErrorPage.jsx'
import Home from './pages/Home.jsx'
import Login from './pages/Login.jsx'
import QuestionDetail from './pages/QuestionDetail.jsx'
import QuestionForm from './pages/QuestionForm.jsx'
import QuestionList from './pages/QuestionList.jsx'
import Signup from './pages/Signup.jsx'
import { lazyWithReload } from './utils/lazyLoad.js'

// 무거운 시각화 화면은 처음 들어갈 때만 내려받는다
const LlmAlignment = lazyWithReload(() => import('./pages/LlmAlignment.jsx'))
const LlmAttention = lazyWithReload(() => import('./pages/LlmAttention.jsx'))
const LlmDataVisualizer = lazyWithReload(() => import('./pages/LlmDataVisualizer.jsx'))
const LlmDecoding = lazyWithReload(() => import('./pages/LlmDecoding.jsx'))
const LlmEmbedding = lazyWithReload(() => import('./pages/LlmEmbedding.jsx'))
const LlmEval = lazyWithReload(() => import('./pages/LlmEval.jsx'))
const LlmOverview = lazyWithReload(() => import('./pages/LlmOverview.jsx'))
const LlmPretrain = lazyWithReload(() => import('./pages/LlmPretrain.jsx'))
const LlmServing = lazyWithReload(() => import('./pages/LlmServing.jsx'))
const LlmSft = lazyWithReload(() => import('./pages/LlmSft.jsx'))
const RagVisualizer = lazyWithReload(() => import('./pages/RagVisualizer.jsx'))

function PageLoading() {
  return (
    <div className="container my-5 text-center text-body-secondary" role="status">
      <span className="spinner-border spinner-border-sm me-2" aria-hidden="true" />화면을 불러오는 중…
    </div>
  )
}

function App() {
  const location = useLocation()

  return (
    <>
      <Navbar />
      {/* 주소가 바뀌면 오류 상태를 초기화한다 */}
      <ErrorBoundary key={location.pathname}>
        <Suspense fallback={<PageLoading />}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/questions" element={<QuestionList />} />
            <Route path="/questions/new" element={<RequireAuth><QuestionForm /></RequireAuth>} />
            <Route path="/questions/:id" element={<QuestionDetail />} />
            <Route path="/questions/:id/edit" element={<RequireAuth><QuestionForm /></RequireAuth>} />
            <Route path="/answers/:id/edit" element={<RequireAuth><AnswerForm /></RequireAuth>} />
            {/* LLM·RAG 메뉴의 하위 화면. /llm, /rag는 각 메뉴의 첫 화면으로 보낸다 */}
            <Route path="/llm" element={<Navigate to="/llm/overview" replace />} />
            <Route path="/llm/overview" element={<LlmOverview />} />
            <Route path="/llm/data" element={<LlmDataVisualizer />} />
            <Route path="/llm/embedding" element={<LlmEmbedding />} />
            <Route path="/llm/attention" element={<LlmAttention />} />
            <Route path="/llm/pretrain" element={<LlmPretrain />} />
            <Route path="/llm/sft" element={<LlmSft />} />
            <Route path="/llm/alignment" element={<LlmAlignment />} />
            <Route path="/llm/eval" element={<LlmEval />} />
            <Route path="/llm/decoding" element={<LlmDecoding />} />
            <Route path="/llm/serving" element={<LlmServing />} />
            <Route path="/rag" element={<Navigate to="/rag/build" replace />} />
            <Route path="/rag/build" element={<RagVisualizer />} />
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />
            <Route path="*" element={<ErrorPage status={404} />} />
          </Routes>
        </Suspense>
      </ErrorBoundary>
    </>
  )
}

export default App
