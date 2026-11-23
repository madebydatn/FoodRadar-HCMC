const API_BASE = String(import.meta.env.VITE_MILEAGE_API_URL || '').replace(/\/+$/, '')
const TOKEN_KEY = 'foodradar-mileage-token'

export function getStoredToken() {
  try {
    return sessionStorage.getItem(TOKEN_KEY) || ''
  } catch {
    return ''
  }
}

export function storeToken(token) {
  try {
    if (token) sessionStorage.setItem(TOKEN_KEY, token)
    else sessionStorage.removeItem(TOKEN_KEY)
  } catch {
    throw new Error('Trình duyệt không cho phép lưu phiên đăng nhập. Hãy kiểm tra cài đặt quyền riêng tư.')
  }
}

async function request(path, { method = 'GET', body, token, bootstrapSecret } = {}) {
  if (!API_BASE) throw new Error('Chưa cấu hình VITE_MILEAGE_API_URL trong môi trường frontend.')

  const headers = { 'Content-Type': 'application/json' }
  if (token) headers.Authorization = `Bearer ${token}`
  if (bootstrapSecret) headers['X-Bootstrap-Secret'] = bootstrapSecret

  let response
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    throw new Error('Không kết nối được máy chủ kilomet. Vui lòng kiểm tra mạng hoặc API.')
  }

  const data = await response.json().catch(() => ({}))
  
  if (!response.ok) {
    if (response.status === 401 && token) {
      const message = 'Phiên đăng nhập đã hết hạn hoặc bị thu hồi. Vui lòng đăng nhập lại.'
  
      try {
        storeToken('')
      } catch {
        // Bỏ qua nếu trình duyệt không cho phép xóa sessionStorage
      }
  
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('foodradar-mileage-auth-expired', {
            detail: { message },
          })
        )
      }
  
      throw new Error(message)
    }
  
    throw new Error(data.error || `Yêu cầu thất bại (${response.status}).`)
  }
  
  return data
}

export const mileageApi = {
  health: () => request('/health'),
  register: (username, password) => request('/auth/register', { method: 'POST', body: { username, password } }),
  login: (username, password) => request('/auth/login', { method: 'POST', body: { username, password } }),
  bootstrapAdmin: (username, password, secret) => request('/admin/bootstrap', {
    method: 'POST', body: { username, password }, bootstrapSecret: secret,
  }),
  me: (token) => request('/auth/me', { token }),
  logout: (token) => request('/auth/logout', { method: 'POST', token }),
  currentShift: (token) => request('/shifts/current', { token }),
  shifts: (token, limit = 100) => request(`/shifts?limit=${limit}`, { token }),
  startShift: (token, startKm) => request('/shifts/start', { method: 'POST', token, body: { start_km: startKm } }),
  endShift: (token, shiftId, endKm) => request(`/shifts/${encodeURIComponent(shiftId)}/end`, {
    method: 'POST', token, body: { end_km: endKm },
  }),
  adminOverview: (token) => request('/admin/overview', { token }),
  adminUsers: (token) => request('/admin/users', { token }),
  adminShifts: (token, userId = '') => request(`/admin/shifts?limit=300${userId ? `&user_id=${encodeURIComponent(userId)}` : ''}`, { token }),
  updateUser: (token, userId, changes) => request(`/admin/users/${encodeURIComponent(userId)}`, {
    method: 'PATCH', token, body: changes,
  }),
  resetPassword: (token, userId, password) => request(`/admin/users/${encodeURIComponent(userId)}/password`, {
    method: 'PUT', token, body: { password },
  }),
  deleteCompletedShifts: (token, userId) =>
  request(
    `/admin/users/${encodeURIComponent(userId)}/shifts/completed`,
    {
      method: 'DELETE',
      token,
    }
  ),
}
