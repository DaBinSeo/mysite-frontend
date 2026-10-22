import { useEffect, useState } from 'react'
import { api, setAuthFailureHandler, tokenStore } from '../api/client.js'
import { AuthContext } from './useAuth.js'

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => (tokenStore.access ? tokenStore.user : null))

  useEffect(() => {
    setAuthFailureHandler(() => setUser(null))
    // 새로고침 시 저장된 토큰이 아직 유효한지 확인한다 (만료됐으면 refresh, 그것도 실패하면 로그아웃)
    if (tokenStore.access) {
      api.get('/auth/me/').then((me) => {
        tokenStore.save({ user: me })
        setUser(me)
      }).catch(() => {})
    }
  }, [])

  const saveSession = (data) => {
    tokenStore.save(data)
    setUser(data.user)
  }

  const value = {
    user,
    login: async (username, password) => saveSession(await api.post('/auth/login/', { username, password })),
    signup: async (form) => saveSession(await api.post('/auth/signup/', form)),
    logout: () => {
      const { refresh } = tokenStore
      tokenStore.clear()
      setUser(null)
      // 서버에서 이 기기의 refresh 토큰을 폐기한다. 실패해도 화면은 이미 로그아웃 상태다
      if (refresh) api.post('/auth/logout/', { refresh }).catch(() => {})
    },
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
