import { createContext, useContext } from 'react'

export const AuthContext = createContext(null)

// { user, login, signup, logout } — AuthProvider(AuthContext.jsx)가 값을 채운다
export function useAuth() {
  return useContext(AuthContext)
}
