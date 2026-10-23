import { Navigate, Route, Routes, useLocation } from 'react-router'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import Navbar from './components/Navbar.jsx'
import RequireAuth from './components/RequireAuth.jsx'
import AnswerForm from './pages/AnswerForm.jsx'
import ErrorPage from './pages/ErrorPage.jsx'
import Home from './pages/Home.jsx'
import LlmDataVisualizer from './pages/LlmDataVisualizer.jsx'
import Login from './pages/Login.jsx'
import QuestionDetail from './pages/QuestionDetail.jsx'
import QuestionForm from './pages/QuestionForm.jsx'
import QuestionList from './pages/QuestionList.jsx'
import RagVisualizer from './pages/RagVisualizer.jsx'
import Signup from './pages/Signup.jsx'

function App() {
  const location = useLocation()

  return (
    <>
      <Navbar />
      {/* 주소가 바뀌면 오류 상태를 초기화한다 */}
      <ErrorBoundary key={location.pathname}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/questions" element={<QuestionList />} />
          <Route path="/questions/new" element={<RequireAuth><QuestionForm /></RequireAuth>} />
          <Route path="/questions/:id" element={<QuestionDetail />} />
          <Route path="/questions/:id/edit" element={<RequireAuth><QuestionForm /></RequireAuth>} />
          <Route path="/answers/:id/edit" element={<RequireAuth><AnswerForm /></RequireAuth>} />
          {/* LLM·RAG 메뉴의 하위 화면. /llm, /rag는 각 메뉴의 첫 화면으로 보낸다 */}
          <Route path="/llm" element={<Navigate to="/llm/data" replace />} />
          <Route path="/llm/data" element={<LlmDataVisualizer />} />
          <Route path="/rag" element={<Navigate to="/rag/build" replace />} />
          <Route path="/rag/build" element={<RagVisualizer />} />
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="*" element={<ErrorPage status={404} />} />
        </Routes>
      </ErrorBoundary>
    </>
  )
}

export default App
