import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { mileageApi, getStoredToken, storeToken } from './mileageService'
import './Mileage.css'

const MileageContext = createContext(null)

function AuthScreen({ onClose }) {
  const [mode, setMode] = useState('login')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const { login, register, globalError } = useMileage()

  const submit = async (event) => {
    event.preventDefault()
    setError('')

    if (mode === 'register' && password !== confirmPassword) {
      setError('Mật khẩu nhập lại không khớp.')
      return
    }

    setBusy(true)
    try {
      if (mode === 'register') await register(username.trim(), password)
      else await login(username.trim(), password)

      onClose()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mileage-modal-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose()
    }}>
      <section className="mileage-modal mileage-auth-modal" role="dialog" aria-modal="true" aria-labelledby="mileage-auth-title">
        <button
          className="mileage-close-button mileage-auth-close"
          type="button"
          onClick={onClose}
          aria-label="Đóng"
        >×</button>

        <form className="mileage-auth-card" onSubmit={submit}>
          <div className="mileage-auth-brand">FoodRadar <span>HCMC</span></div>
          <h1 id="mileage-auth-title">{mode === 'login' ? 'Đăng nhập' : 'Tạo tài khoản'}</h1>
          <p className="mileage-muted">Đăng nhập để quản lý kilomet ca làm việc.</p>

          {globalError && <div className="mileage-alert mileage-alert-error">{globalError}</div>}

          <label htmlFor="mileage-username">Tên đăng nhập</label>
          <input
            id="mileage-username"
            autoComplete="username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            minLength={3}
            maxLength={24}
            pattern="[A-Za-z0-9._-]{3,24}"
            required
            placeholder="Ví dụ: nguyenvana"
          />

          <label htmlFor="mileage-password">Mật khẩu</label>
          <input
            id="mileage-password"
            type="password"
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            minLength={8}
            maxLength={128}
            required
            placeholder="Tối thiểu 8 ký tự"
          />

          {mode === 'register' && (
            <>
              <label htmlFor="mileage-confirm-password">Nhập lại mật khẩu</label>
              <input
                id="mileage-confirm-password"
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                minLength={8}
                maxLength={128}
                required
                placeholder="Nhập lại mật khẩu"
              />
              <small className="mileage-hint">
                Username gồm 3–24 ký tự: chữ, số, dấu chấm, gạch dưới hoặc gạch ngang.
              </small>
            </>
          )}

          {error && <div className="mileage-alert mileage-alert-error" role="alert">{error}</div>}

          <button className="mileage-primary-button" type="submit" disabled={busy}>
            {busy ? 'Đang xử lý...' : mode === 'login' ? 'Đăng nhập' : 'Đăng ký và sử dụng ngay'}
          </button>

          <div className="mileage-auth-switch">
            {mode === 'login' ? 'Chưa có tài khoản?' : 'Đã có tài khoản?'}{' '}
            <button
              type="button"
              onClick={() => {
                setMode(mode === 'login' ? 'register' : 'login')
                setError('')
              }}
            >
              {mode === 'login' ? 'Đăng ký' : 'Đăng nhập'}
            </button>
          </div>
        </form>
      </section>
    </div>
  )
}


export function MileageProvider({ children }) {
  const [token, setToken] = useState(() => getStoredToken())
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [currentShift, setCurrentShift] = useState(null)
  const [globalError, setGlobalError] = useState('')
  
  useEffect(() => {
    const handleAuthExpired = (event) => {
      setToken('')
      setUser(null)
      setCurrentShift(null)
      setGlobalError(
        event.detail?.message ||
        'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.'
      )
    }
  
    window.addEventListener(
      'foodradar-mileage-auth-expired',
      handleAuthExpired
    )
  
    return () => {
      window.removeEventListener(
        'foodradar-mileage-auth-expired',
        handleAuthExpired
      )
    }
  }, [])

  const refreshCurrentShift = useCallback(async (activeToken = token) => {
    if (!activeToken) {
      setCurrentShift(null)
      return null
    }
    const result = await mileageApi.currentShift(activeToken)
    setCurrentShift(result.shift)
    return result.shift
  }, [token])

  const acceptSession = useCallback(async (result) => {
    storeToken(result.token)
    setToken(result.token)
    setUser(result.user)
    setGlobalError('')
    const current = await mileageApi.currentShift(result.token)
    setCurrentShift(current.shift)
  }, [])

  const login = useCallback(async (username, password) => {
    const result = await mileageApi.login(username, password)
    await acceptSession(result)
  }, [acceptSession])

  const register = useCallback(async (username, password) => {
    const result = await mileageApi.register(username, password)
    await acceptSession(result)
  }, [acceptSession])

  const logout = useCallback(async () => {
    const activeToken = token
    storeToken('')
    setToken('')
    setUser(null)
    setCurrentShift(null)
    if (activeToken) {
      try { await mileageApi.logout(activeToken) } catch { /* phiên ở client đã được xóa */ }
    }
  }, [token])

  const startShift = useCallback(async (startKm) => {
    const result = await mileageApi.startShift(token, startKm)
    setCurrentShift(result.shift)
    return result.shift
  }, [token])

  const endShift = useCallback(async (shiftId, endKm) => {
    const result = await mileageApi.endShift(token, shiftId, endKm)
    setCurrentShift(null)
    return result.shift
  }, [token])

  useEffect(() => {
    let cancelled = false
    const restore = async () => {
      if (!token) {
        setLoading(false)
        return
      }
      try {
        const result = await mileageApi.me(token)
        if (cancelled) return
        setUser(result.user)
        await refreshCurrentShift(token)
      } catch (error) {
        if (!cancelled) {
          storeToken('')
          setToken('')
          setUser(null)
          setCurrentShift(null)
          setGlobalError(error.message)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    restore()
    return () => { cancelled = true }
  }, [token, refreshCurrentShift])

  const value = useMemo(() => ({
    token, user, loading, currentShift, globalError,
    login, register, logout, startShift, endShift, refreshCurrentShift,
  }), [token, user, loading, currentShift, globalError, login, register, logout, startShift, endShift, refreshCurrentShift])

  return (
    <MileageContext.Provider value={value}>
      {children}
    </MileageContext.Provider>
  )
}

function useMileage() {
  const value = useContext(MileageContext)
  if (!value) throw new Error('useMileage phải được sử dụng bên trong MileageProvider.')
  return value
}

function formatKm(value) {
  if (value === null || value === undefined || value === '') return '—'
  return `${Number(value).toLocaleString('vi-VN', { maximumFractionDigits: 1 })} km`
}

function formatDateTime(value) {
  if (!value) return '—'
  return new Date(value).toLocaleString('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit',
    year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

function dateInVietnam(value) {
  if (!value) return ''
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date(value))
}

function sumDistance(shifts, fromDate) {
  return shifts.reduce((total, shift) => {
    if (shift.status !== 'completed' || !shift.ended_at) return total
    const date = dateInVietnam(shift.ended_at)
    return date >= fromDate ? total + Number(shift.distance_km || 0) : total
  }, 0)
}

function MileagePanel({ onClose }) {
  const { token, user, currentShift, startShift, endShift } = useMileage()
  const [tab, setTab] = useState('shift')
  const [startKm, setStartKm] = useState('')
  const [endKm, setEndKm] = useState('')
  const [history, setHistory] = useState([])
  const [overview, setOverview] = useState(null)
  const [users, setUsers] = useState([])
  const [allShifts, setAllShifts] = useState([])
  const [selectedUser, setSelectedUser] = useState('')
  const [resetPasswords, setResetPasswords] = useState({})
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const loadHistory = useCallback(async () => {
    const result = await mileageApi.shifts(token, 200)
    setHistory(result.shifts || [])
  }, [token])

  const deleteHistory = async (account) => {
    const confirmed = window.confirm(
      `Bạn có chắc muốn xóa toàn bộ lịch sử ca đã kết thúc của ${account.username}?\n\nCa đang chạy sẽ được giữ nguyên. Tài khoản và quyền đăng nhập không bị ảnh hưởng.`
    )
  
    if (!confirmed) return
  
    setBusy(true)
    setError('')
    setMessage('')
  
    try {
      const result = await mileageApi.deleteCompletedShifts(
        token,
        account.id
      )
  
      await loadAdmin()
  
      setMessage(result.message)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const loadAdmin = useCallback(async () => {
    const [stats, accountResult, shiftResult] = await Promise.all([
      mileageApi.adminOverview(token), mileageApi.adminUsers(token), mileageApi.adminShifts(token, selectedUser),
    ])
    setOverview(stats)
    setUsers(accountResult.users || [])
    setAllShifts(shiftResult.shifts || [])
  }, [token, selectedUser])

  const deleteShift = async (shift) => {
    if (!window.confirm(`Xóa ca làm việc của ${shift.username}?`)) return

    setBusy(true)
    setError('')
    setMessage('')

    try {
      const result = await mileageApi.deleteShift(token, shift.id)
      await loadAdmin()
      setMessage(result.message || 'Đã xóa ca làm việc.')
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }
  
  useEffect(() => {
    if (!message && !error) return undefined
    const timer = window.setTimeout(() => { setMessage(''); setError('') }, 4500)
    return () => window.clearTimeout(timer)
  }, [message, error])

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        setError('')
        if (tab === 'history') await loadHistory()
        if (tab === 'admin' && user.role === 'admin') await loadAdmin()
        if (!cancelled) setError('')
      } catch (err) {
        if (!cancelled) setError(err.message)
      }
    }
    load()
    return () => { cancelled = true }
  }, [tab, user.role, loadHistory, loadAdmin])

  const handleStart = async (event) => {
    event.preventDefault()
    setBusy(true); setError(''); setMessage('')
    try {
      await startShift(Number(startKm))
      setStartKm('')
      setMessage('Đã bắt đầu ca làm việc.')
    } catch (err) { setError(err.message) }
    finally { setBusy(false) }
  }

  const handleEnd = async (event) => {
    event.preventDefault()
    setBusy(true); setError(''); setMessage('')
    try {
      const shift = await endShift(currentShift.id, Number(endKm))
      setEndKm('')
      setMessage(`Đã kết thúc ca. Quãng đường: ${formatKm(shift.distance_km)}.`)
      await loadHistory()
    } catch (err) { setError(err.message) }
    finally { setBusy(false) }
  }

  const updateAccount = async (target, changes) => {
    setBusy(true); setError(''); setMessage('')
    try {
      await mileageApi.updateUser(token, target.id, changes)
      await loadAdmin()
      setMessage(`Đã cập nhật tài khoản ${target.username}.`)
    } catch (err) { setError(err.message) }
    finally { setBusy(false) }
  }

  const resetPassword = async (target) => {
    const password = resetPasswords[target.id] || ''
    if (password.length < 8) { setError('Mật khẩu mới phải có ít nhất 8 ký tự.'); return }
    setBusy(true); setError(''); setMessage('')
    try {
      await mileageApi.resetPassword(token, target.id, password)
      setResetPasswords((current) => ({ ...current, [target.id]: '' }))
      setMessage(`Đã đặt lại mật khẩu cho ${target.username}; các phiên cũ đã bị thu hồi.`)
    } catch (err) { setError(err.message) }
    finally { setBusy(false) }
  }

  const today = new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const weekStart = new Date(Date.now() + 7 * 60 * 60 * 1000 - 6 * 86400000).toISOString().slice(0, 10)
  const monthStart = `${today.slice(0, 7)}-01`

  return (
    <div className="mileage-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <section className="mileage-modal" role="dialog" aria-modal="true" aria-labelledby="mileage-panel-title">
        <header className="mileage-modal-header">
          <div>
            <span className="mileage-kicker">FOODRADAR · KILOMET</span>
            <h2 id="mileage-panel-title">Quản lý ca làm việc</h2>
            <p>Đăng nhập: <strong>{user.username}</strong> · {user.role === 'admin' ? 'Quản trị viên' : 'Tài xế'}</p>
          </div>
          <button className="mileage-close-button" type="button" onClick={onClose} aria-label="Đóng">×</button>
        </header>

        <nav className="mileage-tabs" aria-label="Chức năng kilomet">
          <button className={tab === 'shift' ? 'active' : ''} onClick={() => setTab('shift')} type="button">Ca hiện tại</button>
          <button className={tab === 'history' ? 'active' : ''} onClick={() => setTab('history')} type="button">Lịch sử</button>
          {user.role === 'admin' && <button className={tab === 'admin' ? 'active' : ''} onClick={() => setTab('admin')} type="button">Quản trị</button>}
        </nav>

        {(message || error) && <div className={`mileage-alert ${error ? 'mileage-alert-error' : 'mileage-alert-success'}`}>{error || message}</div>}

        {tab === 'shift' && (
          <div className="mileage-panel-body">
            {currentShift ? (
              <>
                <div className="mileage-status-line"><span className="mileage-status-dot" />Đang trong ca làm việc</div>
                <div className="mileage-km-summary">
                  <div><span>Kilomet đầu ca</span><strong>{formatKm(currentShift.start_km)}</strong></div>
                  <div><span>Bắt đầu lúc</span><strong>{formatDateTime(currentShift.started_at)}</strong></div>
                </div>
                <form className="mileage-form" onSubmit={handleEnd}>
                  <label htmlFor="mileage-end-km">Kilomet hiện tại khi kết thúc ca</label>
                  <input id="mileage-end-km" type="number" inputMode="decimal" min={currentShift.start_km} max="10000000" step="0.1" required value={endKm} onChange={(event) => setEndKm(event.target.value)} placeholder="Ví dụ: 12642.5" />
                  <button className="mileage-danger-button" type="submit" disabled={busy || endKm === ''}>{busy ? 'Đang lưu...' : 'Kết thúc ca'}</button>
                </form>
                <p className="mileage-hint">Không thể kết thúc ca bằng số kilomet nhỏ hơn số đầu ca. Bạn chỉ có thể mở ca mới sau khi chốt ca hiện tại.</p>
              </>
            ) : (
              <>
                <div className="mileage-empty-state"><span>◷</span><strong>Bạn chưa bắt đầu ca nào</strong><p>Nhập số kilomet trên đồng hồ xe để bắt đầu ca mới.</p></div>
                <form className="mileage-form" onSubmit={handleStart}>
                  <label htmlFor="mileage-start-km">Kilomet hiện tại khi bắt đầu ca</label>
                  <input id="mileage-start-km" type="number" inputMode="decimal" min="0" max="10000000" step="0.1" required value={startKm} onChange={(event) => setStartKm(event.target.value)} placeholder="Ví dụ: 12580.5" />
                  <button className="mileage-primary-button" type="submit" disabled={busy || startKm === ''}>{busy ? 'Đang lưu...' : 'Bắt đầu ca'}</button>
                </form>
              </>
            )}
          </div>
        )}

        {tab === 'history' && (
          <div className="mileage-panel-body">
            <div className="mileage-stats-grid">
              <div><span>Hôm nay</span><strong>{formatKm(sumDistance(history, today))}</strong></div>
              <div><span>7 ngày gần nhất</span><strong>{formatKm(sumDistance(history, weekStart))}</strong></div>
              <div><span>Tháng này</span><strong>{formatKm(sumDistance(history, monthStart))}</strong></div>
            </div>
            <div className="mileage-section-title"><strong>Lịch sử ca làm việc</strong><button type="button" onClick={() => loadHistory().catch((err) => setError(err.message))}>Làm mới</button></div>
            {history.length === 0 ? <p className="mileage-empty-copy">Chưa có lịch sử ca làm việc.</p> : (
              <div className="mileage-table-wrap">
                <table className="mileage-table">
                  <thead><tr><th>Thời gian</th><th>Đầu ca</th><th>Cuối ca</th><th>Quãng đường</th><th>Trạng thái</th></tr></thead>
                  <tbody>{history.map((shift) => (
                    <tr key={shift.id}>
                      <td>{formatDateTime(shift.started_at)}<small>{shift.ended_at ? `→ ${formatDateTime(shift.ended_at)}` : 'Chưa kết thúc'}</small></td>
                      <td>{formatKm(shift.start_km)}</td><td>{formatKm(shift.end_km)}</td>
                      <td><strong>{formatKm(shift.distance_km)}</strong></td>
                      <td><span className={`mileage-pill ${shift.status}`}>{shift.status === 'active' ? 'Đang chạy' : 'Đã chốt'}</span></td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {tab === 'admin' && user.role === 'admin' && (
          <div className="mileage-panel-body">
            {overview && <div className="mileage-stats-grid mileage-admin-stats">
              <div><span>Tài khoản hoạt động</span><strong>{overview.active_users}</strong></div>
              <div><span>Đang trong ca</span><strong>{overview.active_shifts}</strong></div>
              <div><span>Ca đã chốt hôm nay</span><strong>{overview.completed_shifts_today}</strong></div>
              <div><span>Kilomet hôm nay</span><strong>{formatKm(overview.distance_today)}</strong></div>
            </div>}
            <div className="mileage-section-title"><strong>Quản lý tài khoản ({users.length})</strong><button type="button" onClick={() => loadAdmin().catch((err) => setError(err.message))}>Làm mới</button></div>
            <div className="mileage-admin-users">
              {users.map((account) => (
                <article className="mileage-user-row" key={account.id}>
                  <div className="mileage-user-main">
                    <strong>{account.username}</strong>
                    <span>{account.role === 'admin' ? 'Admin' : 'Tài xế'} · {account.status === 'active' ? 'Đang hoạt động' : 'Đã khóa'} · {formatKm(account.distance_today)} hôm nay</span>
                  </div>
                  <div className="mileage-user-actions">
                    <button type="button" disabled={busy || account.id === user.id} onClick={() => updateAccount(account, { status: account.status === 'active' ? 'locked' : 'active' })}>{account.status === 'active' ? 'Khóa' : 'Mở khóa'}</button>
                    <button type="button" disabled={busy || account.id === user.id} onClick={() => updateAccount(account, { role: account.role === 'admin' ? 'user' : 'admin' })}>{account.role === 'admin' ? 'Hạ quyền' : 'Cấp admin'}</button>
                    <button type="button" onClick={() => setSelectedUser(account.id)}>Xem ca</button>
                    <button
                      type="button"
                      className="mileage-delete-history-button"
                      disabled={busy}
                      onClick={() => deleteHistory(account)}
                    >
                      Xóa lịch sử
                    </button>
                    
                  </div>
                  <div className="mileage-reset-row">
                    <input type="password" autoComplete="new-password" minLength="8" placeholder="Mật khẩu mới (ít nhất 8 ký tự)" value={resetPasswords[account.id] || ''} onChange={(event) => setResetPasswords((current) => ({ ...current, [account.id]: event.target.value }))} />
                    <button type="button" disabled={busy || account.id === user.id || (resetPasswords[account.id] || '').length < 8} onClick={() => resetPassword(account)}>Đặt lại mật khẩu</button>
                  </div>
                </article>
              ))}
            </div>
            <div className="mileage-section-title mileage-admin-history-title">
              <strong>Lịch sử toàn hệ thống</strong>
              <select value={selectedUser} onChange={(event) => setSelectedUser(event.target.value)} aria-label="Lọc theo tài khoản">
                <option value="">Tất cả tài khoản</option>
                {users.map((account) => <option key={account.id} value={account.id}>{account.username}</option>)}
              </select>
            </div>
            <div className="mileage-table-wrap">
              <table className="mileage-table">
                <thead>
                  <tr>
                    <th>Tài khoản</th>
                    <th>Bắt đầu</th>
                    <th>Kết thúc</th>
                    <th>Km</th>
                    <th>Trạng thái</th>
                    <th>Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {allShifts.map((shift) => (
                    <tr key={shift.id}>
                      <td>{shift.username}</td>
                      <td>{formatDateTime(shift.started_at)}</td>
                      <td>{formatDateTime(shift.ended_at)}</td>
                      <td>{formatKm(shift.distance_km)}</td>
                      <td>{shift.status === 'active' ? 'Đang chạy' : 'Đã chốt'}</td>
                      <td>
                        {shift.status === 'completed' && (
                          <td>
                            {shift.status === 'completed' && (
                              <span
                                onClick={() => !busy && deleteShift(shift)}
                                style={{
                                  color: '#c62828',
                                  cursor: busy ? 'not-allowed' : 'pointer',
                                  position: 'relative',
                                  top: '-2px',
                                }}
                              >
                                Xóa
                              </span>
                            )}
                          </td>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
    </div>
  )
}


export function MileageHeader() {
  const { user, logout, currentShift, loading } = useMileage()
  const [open, setOpen] = useState(false)

  return (
    <>
      <div className="mileage-header-controls">
        <button
          className={`mileage-header-button ${user && currentShift ? 'has-active-shift' : ''}`}
          type="button"
          disabled={loading}
          onClick={() => setOpen(true)}
        >
          <span aria-hidden="true">◷</span>{' '}
          {loading ? 'Đang tải...' : user ? 'Dữ liệu tài xế' : 'Đăng nhập'}    
        </button>

        {user && (
          <>
            <span className="mileage-header-user" title={user.username}>
              {user.username}{user.role === 'admin' ? ' · Admin' : ''}
            </span>
            <button className="mileage-logout-button" type="button" onClick={logout}>
              Đăng xuất
            </button>
          </>
        )}
      </div>

      {open && (
        user
          ? <MileagePanel onClose={() => setOpen(false)} />
          : <AuthScreen onClose={() => setOpen(false)} />
      )}
    </>
  )
}

