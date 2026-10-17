import { Route, Routes } from 'react-router'
import Navbar from './components/Navbar.jsx'
import RequireAuth from './components/RequireAuth.jsx'
import AnswerForm from './pages/AnswerForm.jsx'
import Login from './pages/Login.jsx'
import NotFound from './pages/NotFound.jsx'
import QuestionDetail from './pages/QuestionDetail.jsx'
import QuestionForm from './pages/QuestionForm.jsx'
import QuestionList from './pages/QuestionList.jsx'
import Signup from './pages/Signup.jsx'

function App() {
  return (
    <>
      <Navbar />
      <Routes>
        <Route path="/" element={<QuestionList />} />
        <Route path="/questions/new" element={<RequireAuth><QuestionForm /></RequireAuth>} />
        <Route path="/questions/:id" element={<QuestionDetail />} />
        <Route path="/questions/:id/edit" element={<RequireAuth><QuestionForm /></RequireAuth>} />
        <Route path="/answers/:id/edit" element={<RequireAuth><AnswerForm /></RequireAuth>} />
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </>
  )
}

export default App
