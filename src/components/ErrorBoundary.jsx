import { Component } from 'react'
import ErrorPage from '../pages/ErrorPage.jsx'

// 화면을 그리다 예외가 나면 흰 화면 대신 오류 화면을 보여 준다 (React 오류 경계는 클래스 컴포넌트만 가능)
export default class ErrorBoundary extends Component {
  state = { error: null }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error(error, info.componentStack)
  }

  render() {
    if (this.state.error) {
      return <ErrorPage status={500} title="화면을 표시하지 못했어요" message="화면을 그리는 중 오류가 발생했습니다." />
    }
    return this.props.children
  }
}
