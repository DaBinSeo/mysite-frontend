// API 버전은 .env의 VITE_API_VERSION으로 바꿀 수 있다 (기본 v1)
const API_VERSION = import.meta.env.VITE_API_VERSION ?? 'v1'
export const API_BASE = `/api/${API_VERSION}`

const ACCESS_KEY = 'pybo.access'
const REFRESH_KEY = 'pybo.refresh'
const USER_KEY = 'pybo.user'

// JWT와 로그인 사용자 정보는 localStorage에 둔다 (학습용. 본문은 서버에서 nh3로 정리하고 React가 이스케이프한다)
export const tokenStore = {
  get access() {
    return localStorage.getItem(ACCESS_KEY)
  },
  get refresh() {
    return localStorage.getItem(REFRESH_KEY)
  },
  get user() {
    const raw = localStorage.getItem(USER_KEY)
    if (!raw) return null
    try {
      return JSON.parse(raw)
    } catch {
      localStorage.removeItem(USER_KEY) // 손상된 값은 지워서 다음 로드부터 정상화
      return null
    }
  },
  save({ access, refresh, user }) {
    if (access) localStorage.setItem(ACCESS_KEY, access)
    if (refresh) localStorage.setItem(REFRESH_KEY, refresh)
    if (user) localStorage.setItem(USER_KEY, JSON.stringify(user))
  },
  clear() {
    localStorage.removeItem(ACCESS_KEY)
    localStorage.removeItem(REFRESH_KEY)
    localStorage.removeItem(USER_KEY)
  },
}

// 오류 응답: detail(설명)과 errors(필드별 메시지)를 함께 담는다
export class ApiError extends Error {
  constructor(status, body) {
    super(body?.detail ?? `요청에 실패했습니다. (HTTP ${status})`)
    this.status = status
    this.errors = body?.errors ?? null
  }
}

// refresh까지 실패해서 로그아웃될 때 호출 (AuthContext가 등록)
let onAuthFailure = () => {}
export function setAuthFailureHandler(handler) {
  onAuthFailure = handler
}

function send(method, path, body, token) {
  const headers = {}
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (token) headers.Authorization = `Bearer ${token}`
  return fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

async function refreshAccess(refresh) {
  const res = await send('POST', '/auth/refresh/', { refresh })
  if (!res.ok) return null
  const { access } = await res.json()
  // 갱신하는 사이에 로그아웃(또는 다른 계정으로 로그인)했으면 늦게 온 토큰은 버린다
  if (tokenStore.refresh !== refresh) return null
  tokenStore.save({ access })
  return access
}

let refreshing = null // 여러 요청이 동시에 401을 받아도 refresh는 한 번만 보낸다

export async function apiRequest(method, path, body) {
  let res = await send(method, path, body, tokenStore.access)
  const refresh = tokenStore.refresh
  if (res.status === 401 && refresh) {
    refreshing ??= refreshAccess(refresh).finally(() => {
      refreshing = null
    })
    const access = await refreshing
    if (access) {
      res = await send(method, path, body, access)
    } else if (tokenStore.refresh === refresh) {
      // refresh도 실패: 로그아웃 처리. 그사이 세션이 바뀌었으면 새 세션은 건드리지 않는다
      tokenStore.clear()
      onAuthFailure()
    }
  }
  if (res.status === 204) return null
  const data = await res.json().catch(() => null)
  if (!res.ok) throw new ApiError(res.status, data)
  return data
}

export const api = {
  get: (path) => apiRequest('GET', path),
  post: (path, body = {}) => apiRequest('POST', path, body),
  put: (path, body) => apiRequest('PUT', path, body),
  delete: (path) => apiRequest('DELETE', path),
}
