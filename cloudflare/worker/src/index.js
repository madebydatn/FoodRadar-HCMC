const PASSWORD_ITERATIONS = 100000
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7
const MAX_KM = 10000000

const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers },
  })

const fail = (message, status = 400) => json({ error: message }, status)
const nowIso = () => new Date().toISOString()
const nowSeconds = () => Math.floor(Date.now() / 1000)
const makeId = () => crypto.randomUUID()

function bytesToBase64Url(bytes) {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function base64UrlToBytes(value) {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/')
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4)
  return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0))
}

async function sha256(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return bytesToBase64Url(new Uint8Array(digest))
}

async function hashPassword(password, salt, iterations = PASSWORD_ITERATIONS) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  )
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: base64UrlToBytes(salt), iterations },
    key,
    256
  )
  return bytesToBase64Url(new Uint8Array(bits))
}

function constantTimeEqual(left, right) {
  const a = new TextEncoder().encode(String(left ?? ''))
  const b = new TextEncoder().encode(String(right ?? ''))
  if (a.length !== b.length) return false
  let mismatch = 0
  for (let i = 0; i < a.length; i += 1) mismatch |= a[i] ^ b[i]
  return mismatch === 0
}

function validUsername(username) {
  return typeof username === 'string' && /^[a-zA-Z0-9._-]{3,24}$/.test(username)
}

function validPassword(password) {
  return typeof password === 'string' && password.length >= 8 && password.length <= 128
}

function validKm(value) {
  if (typeof value !== 'number') return false
  return Number.isFinite(value) && value >= 0 && value <= MAX_KM && Math.abs(value * 10 - Math.round(value * 10)) < 1e-7
}

function publicUser(user) {
  return {
    id: user.id,
    username: user.username,
    role: user.role,
    status: user.status,
    created_at: user.created_at,
  }
}

function getAllowedOrigins(env) {
  return String(env.FRONTEND_ORIGINS || 'https://madebydatn.github.io')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
}

function corsHeaders(request, env) {
  const origin = request.headers.get('Origin') || ''
  const allowed = getAllowedOrigins(env)
  const headers = {
    'Vary': 'Origin',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, PUT, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Bootstrap-Secret',
    'Access-Control-Max-Age': '86400',
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'no-store',
  }
  if (allowed.includes(origin)) headers['Access-Control-Allow-Origin'] = origin
  return headers
}

async function readJson(request) {
  try {
    return await request.json()
  } catch {
    return null
  }
}

async function rateLimit(env, key, limit = 10, windowSeconds = 60) {
  const now = nowSeconds()
  const row = await env.DB.prepare(`
    INSERT INTO rate_limits (bucket_key, window_start, attempts)
    VALUES (?, ?, 1)
    ON CONFLICT(bucket_key) DO UPDATE SET
      attempts = CASE
        WHEN rate_limits.window_start <= ? THEN 1
        ELSE rate_limits.attempts + 1
      END,
      window_start = CASE
        WHEN rate_limits.window_start <= ? THEN excluded.window_start
        ELSE rate_limits.window_start
      END
    RETURNING attempts
  `).bind(key, now, now - windowSeconds, now - windowSeconds).first()
  return Number(row?.attempts || 0) <= limit
}

async function createSession(env, user, request) {
  const tokenBytes = crypto.getRandomValues(new Uint8Array(32))
  const token = bytesToBase64Url(tokenBytes)
  const tokenHash = await sha256(token)
  const now = nowSeconds()
  await env.DB.prepare(`
    INSERT INTO sessions (id, user_id, token_hash, created_at, expires_at, ip_address, user_agent)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(
    makeId(), user.id, tokenHash, now, now + SESSION_TTL_SECONDS,
    request.headers.get('CF-Connecting-IP') || null,
    (request.headers.get('User-Agent') || '').slice(0, 300)
  ).run()
  return token
}

async function getAuth(request, env) {
  const authorization = request.headers.get('Authorization') || ''
  const match = authorization.match(/^Bearer\s+([A-Za-z0-9_-]{30,})$/)
  if (!match) return null
  const tokenHash = await sha256(match[1])
  const row = await env.DB.prepare(`
    SELECT
      s.id AS session_id, s.expires_at, s.revoked_at,
      u.id, u.username, u.role, u.status, u.created_at
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ?
    LIMIT 1
  `).bind(tokenHash).first()
  if (!row || row.revoked_at || Number(row.expires_at) <= nowSeconds() || row.status !== 'active') {
    return null
  }
  return { sessionId: row.session_id, user: row }
}

async function requireAuth(request, env) {
  const auth = await getAuth(request, env)
  if (!auth) return { response: fail('Phiên đăng nhập không hợp lệ hoặc đã hết hạn.', 401) }
  return { auth }
}

function requireAdmin(auth) {
  return auth.user.role === 'admin' ? null : fail('Bạn không có quyền thực hiện thao tác này.', 403)
}

async function writeAudit(env, actorId, action, targetId, details = {}) {
  await env.DB.prepare(`
    INSERT INTO audit_logs (id, actor_user_id, action, target_user_id, details_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(makeId(), actorId, action, targetId || null, JSON.stringify(details), nowIso()).run()
}

async function handleBootstrap(request, env) {
  if (!env.BOOTSTRAP_SECRET) return fail('Chưa cấu hình BOOTSTRAP_SECRET.', 503)
  const supplied = request.headers.get('X-Bootstrap-Secret') || ''
  if (!constantTimeEqual(supplied, env.BOOTSTRAP_SECRET)) return fail('Thông tin khởi tạo không hợp lệ.', 403)

  const body = await readJson(request)
  const username = String(body?.username || '').trim()
  const password = body?.password
  if (!validUsername(username)) return fail('Username phải có 3–24 ký tự: chữ, số, dấu chấm, gạch dưới hoặc gạch ngang.')
  if (!validPassword(password)) return fail('Mật khẩu phải có từ 8 đến 128 ký tự.')

  const existing = await env.DB.prepare("SELECT COUNT(*) AS total FROM users WHERE role = 'admin'").first()
  if (Number(existing?.total || 0) > 0) return fail('Admin đã được khởi tạo. Endpoint này không thể dùng lại.', 409)

  const id = makeId()
  const salt = bytesToBase64Url(crypto.getRandomValues(new Uint8Array(16)))
  const passwordHash = await hashPassword(password, salt)
  const createdAt = nowIso()
  try {
    const inserted = await env.DB.prepare(`
      INSERT INTO users (id, username, password_salt, password_hash, password_iterations, role, status, created_at, updated_at)
      SELECT ?, ?, ?, ?, ?, 'admin', 'active', ?, ?
      WHERE NOT EXISTS (SELECT 1 FROM users WHERE role = 'admin')
    `).bind(id, username, salt, passwordHash, PASSWORD_ITERATIONS, createdAt, createdAt).run()
    if (!inserted.meta?.changes) return fail('Admin đã được khởi tạo. Endpoint này không thể dùng lại.', 409)
  } catch {
    return fail('Không thể tạo admin. Username có thể đã tồn tại.', 409)
  }
  const user = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(id).first()
  const token = await createSession(env, user, request)
  return json({ token, user: publicUser(user) }, 201)
}

async function handleRegister(request, env) {
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown'
  if (!(await rateLimit(env, `register:${ip}`, 6, 3600))) return fail('Bạn đã đăng ký quá nhiều lần. Vui lòng thử lại sau.', 429)
  const body = await readJson(request)
  const username = String(body?.username || '').trim()
  const password = body?.password
  if (!validUsername(username)) return fail('Username phải có 3–24 ký tự: chữ, số, dấu chấm, gạch dưới hoặc gạch ngang.')
  if (!validPassword(password)) return fail('Mật khẩu phải có từ 8 đến 128 ký tự.')

  const id = makeId()
  const salt = bytesToBase64Url(crypto.getRandomValues(new Uint8Array(16)))
  const passwordHash = await hashPassword(password, salt)
  const createdAt = nowIso()
  try {
    await env.DB.prepare(`
      INSERT INTO users (id, username, password_salt, password_hash, password_iterations, role, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'user', 'active', ?, ?)
    `).bind(id, username, salt, passwordHash, PASSWORD_ITERATIONS, createdAt, createdAt).run()
  } catch {
    return fail('Username đã được sử dụng.', 409)
  }
  const user = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(id).first()
  const token = await createSession(env, user, request)
  return json({ token, user: publicUser(user) }, 201)
}

async function handleLogin(request, env) {
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown'
  if (!(await rateLimit(env, `login:${ip}`, 12, 900))) return fail('Bạn đã thử đăng nhập quá nhiều lần. Vui lòng thử lại sau.', 429)
  const body = await readJson(request)
  const username = String(body?.username || '').trim()
  const password = body?.password
  if (!username || typeof password !== 'string') return fail('Vui lòng nhập username và mật khẩu.')

  const user = await env.DB.prepare('SELECT * FROM users WHERE username = ? COLLATE NOCASE LIMIT 1').bind(username).first()
  if (!user || user.status !== 'active') return fail('Tên đăng nhập hoặc mật khẩu không chính xác.', 401)
  const passwordHash = await hashPassword(password, user.password_salt, Number(user.password_iterations))
  if (!constantTimeEqual(passwordHash, user.password_hash)) return fail('Tên đăng nhập hoặc mật khẩu không chính xác.', 401)

  const token = await createSession(env, user, request)
  return json({ token, user: publicUser(user) })
}

async function handleOwnShifts(env, user, url) {
  const limit = Math.min(Math.max(Number(url.searchParams.get('limit') || 100), 1), 200)
  const rows = await env.DB.prepare(`
    SELECT id, start_km, end_km, distance_km, started_at, ended_at, status, created_at
    FROM shifts
    WHERE user_id = ?
    ORDER BY started_at DESC
    LIMIT ?
  `).bind(user.id, limit).all()
  return json({ shifts: rows.results || [] })
}

async function handleStartShift(request, env, auth) {
  const body = await readJson(request)
  if (!validKm(body?.start_km)) return fail('Kilomet đầu ca phải là số hợp lệ, không âm và tối đa 1 chữ số thập phân.')
  const id = makeId()
  const now = nowIso()
  try {
    await env.DB.prepare(`
      INSERT INTO shifts (id, user_id, start_km, started_at, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'active', ?, ?)
    `).bind(id, auth.user.id, Number(body.start_km), now, now, now).run()
  } catch {
    return fail('Bạn đang có một ca chưa kết thúc. Hãy kết thúc ca hiện tại trước.', 409)
  }
  const shift = await env.DB.prepare('SELECT * FROM shifts WHERE id = ?').bind(id).first()
  return json({ shift }, 201)
}

async function handleEndShift(request, env, auth, shiftId) {
  const body = await readJson(request)
  if (!validKm(body?.end_km)) return fail('Kilomet cuối ca phải là số hợp lệ, không âm và tối đa 1 chữ số thập phân.')
  const shift = await env.DB.prepare(`
    SELECT id, start_km, status FROM shifts WHERE id = ? AND user_id = ? LIMIT 1
  `).bind(shiftId, auth.user.id).first()
  if (!shift || shift.status !== 'active') return fail('Không tìm thấy ca đang hoạt động.', 404)
  const endKm = Number(body.end_km)
  if (endKm < Number(shift.start_km)) return fail('Kilomet cuối ca không được nhỏ hơn kilomet đầu ca.')
  const endedAt = nowIso()
  const distance = Math.round((endKm - Number(shift.start_km)) * 10) / 10
  const result = await env.DB.prepare(`
    UPDATE shifts
    SET end_km = ?, distance_km = ?, ended_at = ?, status = 'completed', updated_at = ?
    WHERE id = ? AND user_id = ? AND status = 'active'
  `).bind(endKm, distance, endedAt, endedAt, shiftId, auth.user.id).run()
  if (!result.meta?.changes) return fail('Ca đã được cập nhật ở một thiết bị khác. Hãy tải lại dữ liệu.', 409)
  const updated = await env.DB.prepare('SELECT * FROM shifts WHERE id = ?').bind(shiftId).first()
  return json({ shift: updated })
}

async function handleAdminOverview(env) {
  const today = new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const [users, active, totals] = await Promise.all([
    env.DB.prepare("SELECT COUNT(*) AS total FROM users WHERE status = 'active'").first(),
    env.DB.prepare("SELECT COUNT(*) AS total FROM shifts WHERE status = 'active'").first(),
    env.DB.prepare(`
      SELECT COUNT(*) AS shifts, COALESCE(SUM(distance_km), 0) AS distance
      FROM shifts
      WHERE status = 'completed' AND date(ended_at, '+7 hours') = ?
    `).bind(today).first(),
  ])
  return json({
    date: today,
    active_users: Number(users?.total || 0),
    active_shifts: Number(active?.total || 0),
    completed_shifts_today: Number(totals?.shifts || 0),
    distance_today: Number(totals?.distance || 0),
  })
}

async function handleAdminUsers(env) {
  const result = await env.DB.prepare(`
    SELECT
      u.id, u.username, u.role, u.status, u.created_at,
      (SELECT COUNT(*) FROM shifts s WHERE s.user_id = u.id) AS shift_count,
      (SELECT COALESCE(SUM(s.distance_km), 0) FROM shifts s
        WHERE s.user_id = u.id AND s.status = 'completed'
        AND date(s.ended_at, '+7 hours') = date('now', '+7 hours')) AS distance_today,
      (SELECT COUNT(*) FROM shifts s WHERE s.user_id = u.id AND s.status = 'active') AS active_shift_count
    FROM users u
    ORDER BY u.created_at DESC
    LIMIT 500
  `).all()
  return json({ users: result.results || [] })
}

async function handleAdminShifts(env, url) {
  const userId = url.searchParams.get('user_id')
  const limit = Math.min(Math.max(Number(url.searchParams.get('limit') || 200), 1), 500)
  let result
  if (userId) {
    result = await env.DB.prepare(`
      SELECT s.id, s.user_id, u.username, s.start_km, s.end_km, s.distance_km,
        s.started_at, s.ended_at, s.status
      FROM shifts s JOIN users u ON u.id = s.user_id
      WHERE s.user_id = ? ORDER BY s.started_at DESC LIMIT ?
    `).bind(userId, limit).all()
  } else {
    result = await env.DB.prepare(`
      SELECT s.id, s.user_id, u.username, s.start_km, s.end_km, s.distance_km,
        s.started_at, s.ended_at, s.status
      FROM shifts s JOIN users u ON u.id = s.user_id
      ORDER BY s.started_at DESC LIMIT ?
    `).bind(limit).all()
  }
  return json({ shifts: result.results || [] })
}

async function handleAdminUserUpdate(request, env, auth, userId) {
  const body = await readJson(request)
  const target = await env.DB.prepare('SELECT id, username, role, status FROM users WHERE id = ?').bind(userId).first()
  if (!target) return fail('Không tìm thấy tài khoản.', 404)
  if (target.id === auth.user.id && (body?.status === 'locked' || body?.role === 'user')) {
    return fail('Không thể tự khóa hoặc tự hạ quyền tài khoản đang đăng nhập.', 400)
  }
  if (target.role === 'admin' && (body?.status === 'locked' || body?.role === 'user')) {
    const remaining = await env.DB.prepare(
      "SELECT COUNT(*) AS total FROM users WHERE role = 'admin' AND status = 'active' AND id != ?"
    ).bind(target.id).first()
    if (Number(remaining?.total || 0) === 0) return fail('Phải giữ lại ít nhất một admin đang hoạt động.', 409)
  }

  const updates = []
  const values = []
  if (body?.status !== undefined) {
    if (!['active', 'locked'].includes(body.status)) return fail('Trạng thái tài khoản không hợp lệ.')
    updates.push('status = ?')
    values.push(body.status)
  }
  if (body?.role !== undefined) {
    if (!['user', 'admin'].includes(body.role)) return fail('Quyền tài khoản không hợp lệ.')
    updates.push('role = ?')
    values.push(body.role)
  }
  if (!updates.length) return fail('Không có thông tin cần cập nhật.')
  updates.push('updated_at = ?')
  values.push(nowIso(), userId)
  await env.DB.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).bind(...values).run()
  if (body.status === 'locked') {
    await env.DB.prepare('UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL')
      .bind(nowSeconds(), userId).run()
  }
  await writeAudit(env, auth.user.id, 'user_updated', userId, { status: body.status, role: body.role })
  const updated = await env.DB.prepare('SELECT id, username, role, status, created_at FROM users WHERE id = ?').bind(userId).first()
  return json({ user: updated })
}

async function handleAdminPasswordReset(request, env, auth, userId) {
  const body = await readJson(request)
  if (!validPassword(body?.password)) return fail('Mật khẩu mới phải có từ 8 đến 128 ký tự.')
  const target = await env.DB.prepare('SELECT id FROM users WHERE id = ?').bind(userId).first()
  if (!target) return fail('Không tìm thấy tài khoản.', 404)
  if (target.id === auth.user.id) return fail('Không thể tự đặt lại mật khẩu từ phiên hiện tại.', 400)
  const salt = bytesToBase64Url(crypto.getRandomValues(new Uint8Array(16)))
  const passwordHash = await hashPassword(body.password, salt)
  await env.DB.batch([
    env.DB.prepare(`UPDATE users SET password_salt = ?, password_hash = ?, password_iterations = ?, updated_at = ? WHERE id = ?`)
      .bind(salt, passwordHash, PASSWORD_ITERATIONS, nowIso(), userId),
    env.DB.prepare('UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL')
      .bind(nowSeconds(), userId),
  ])
  await writeAudit(env, auth.user.id, 'password_reset', userId)
  return json({ success: true, message: 'Đã đặt lại mật khẩu và thu hồi các phiên đăng nhập cũ.' })
}

export default {
  async fetch(request, env) {
    const headers = corsHeaders(request, env)
    const origin = request.headers.get('Origin') || ''
    const allowed = getAllowedOrigins(env)
    if (origin && !allowed.includes(origin)) return json({ error: 'Origin không được phép.' }, 403)
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers })

    try {
      const url = new URL(request.url)
      const path = url.pathname.replace(/\/+$/, '') || '/'
      const method = request.method.toUpperCase()
      let response

      if (method === 'GET' && path === '/api/health') {
        response = json({ status: 'ok', service: 'foodradar-mileage-api' })
      } else if (method === 'POST' && path === '/api/admin/bootstrap') {
        response = await handleBootstrap(request, env)
      } else if (method === 'POST' && path === '/api/auth/register') {
        response = await handleRegister(request, env)
      } else if (method === 'POST' && path === '/api/auth/login') {
        response = await handleLogin(request, env)
      } else {
        const authResult = await requireAuth(request, env)
        if (authResult.response) response = authResult.response
        else {
          const auth = authResult.auth
          if (method === 'GET' && path === '/api/auth/me') {
            response = json({ user: publicUser(auth.user) })
          } else if (method === 'POST' && path === '/api/auth/logout') {
            await env.DB.prepare('UPDATE sessions SET revoked_at = ? WHERE id = ?')
              .bind(nowSeconds(), auth.sessionId).run()
            response = json({ success: true })
          } else if (method === 'GET' && path === '/api/shifts/current') {
            const shift = await env.DB.prepare("SELECT * FROM shifts WHERE user_id = ? AND status = 'active' LIMIT 1")
              .bind(auth.user.id).first()
            response = json({ shift: shift || null })
          } else if (method === 'GET' && path === '/api/shifts') {
            response = await handleOwnShifts(env, auth.user, url)
          } else if (method === 'POST' && path === '/api/shifts/start') {
            response = await handleStartShift(request, env, auth)
          } else if (method === 'POST' && path.match(/^\/api\/shifts\/[^/]+\/end$/)) {
            const shiftId = path.split('/')[3]
            response = await handleEndShift(request, env, auth, shiftId)
          } else if (path.startsWith('/api/admin/')) {
            const denied = requireAdmin(auth)
            if (denied) response = denied
            else if (method === 'GET' && path === '/api/admin/overview') response = await handleAdminOverview(env)
            else if (method === 'GET' && path === '/api/admin/users') response = await handleAdminUsers(env)
            else if (method === 'GET' && path === '/api/admin/shifts') response = await handleAdminShifts(env, url)
            else if (method === 'PATCH' && path.match(/^\/api\/admin\/users\/[^/]+$/)) {
              response = await handleAdminUserUpdate(request, env, auth, path.split('/')[4])
            } else if (method === 'PUT' && path.match(/^\/api\/admin\/users\/[^/]+\/password$/)) {
              response = await handleAdminPasswordReset(request, env, auth, path.split('/')[4])
            } else response = fail('Không tìm thấy API.', 404)
          } else response = fail('Không tìm thấy API.', 404)
        }
      }
      const responseHeaders = new Headers(response.headers)
      for (const [key, value] of Object.entries(headers)) responseHeaders.set(key, value)
      return new Response(response.body, { status: response.status, statusText: response.statusText, headers: responseHeaders })
    } catch (error) {
      console.error('FoodRadar Mileage API error:', error)
      return json({ error: 'Máy chủ gặp lỗi. Vui lòng thử lại.' }, 500, headers)
    }
  },
}
