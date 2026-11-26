
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

  const endShift = useCallback(async (shiftId, endKm, quoteToken) => {
    const result = await mileageApi.endShift(
      token,
      shiftId,
      endKm,
      quoteToken
    )
  
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

function formatVnd(value) {
  if (value === null || value === undefined || value === '') return '—'

  return `${Math.round(Number(value)).toLocaleString('vi-VN')} đ`
}

function formatFuel(value) {
  if (value === null || value === undefined || value === '') return '—'

  return `${Number(value).toLocaleString('vi-VN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} lít`
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

  const [selectedHistoryShiftId, setSelectedHistoryShiftId] = useState(null)
  const [historyOrders, setHistoryOrders] = useState([])
  const [historyOrdersBusy, setHistoryOrdersBusy] = useState(false)

  const [lastShiftBusy, setLastShiftBusy] = useState(false)
  const [lastShiftMessage, setLastShiftMessage] = useState('')

  const [orders, setOrders] = useState([])
  const [orderFare, setOrderFare] = useState('')
  const [orderBonus, setOrderBonus] = useState('0')
  const [orderTip, setOrderTip] = useState('0')
  const [orderBusy, setOrderBusy] = useState(false)

  const [overview, setOverview] = useState(null)
  const [users, setUsers] = useState([])
  const [allShifts, setAllShifts] = useState([])
  const [selectedUser, setSelectedUser] = useState('')
  const [resetPasswords, setResetPasswords] = useState({})
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const [vehicle, setVehicle] = useState(null)
  const [vehicleName, setVehicleName] = useState('')
  const [fuelType, setFuelType] = useState('Xăng E5 RON 92 Mức 2')
  const [fuelEfficiency, setFuelEfficiency] = useState('')
  const [vehicleBusy, setVehicleBusy] = useState(false)
  
  const [preview, setPreview] = useState(null)
  const [manualMode, setManualMode] = useState(false)
  const [manualPrice, setManualPrice] = useState('')

  const loadHistory = useCallback(async () => {
    const result = await mileageApi.shifts(token, 200)
    setHistory(result.shifts || [])
  }, [token])

  const handleOpenHistoryDetails = async (shiftId) => {
    setSelectedHistoryShiftId(shiftId)
    setHistoryOrders([])
    setHistoryOrdersBusy(true)
    setError('')
    setMessage('')

    try {
      const result = await mileageApi.shiftOrders(token, shiftId)
      setHistoryOrders(result.orders || [])
    } catch (err) {
      setError(err.message)
    } finally {
      setHistoryOrdersBusy(false)
    }
  }

  const handleBackToHistory = () => {
    setSelectedHistoryShiftId(null)
    setHistoryOrders([])
    setHistoryOrdersBusy(false)
  }

  const handleDeleteHistoryOrder = async (order) => {
    const confirmed = window.confirm(
      'Bạn có chắc chắn muốn xóa đơn này khỏi lịch sử ca? Thu nhập của ca sẽ bị giảm tương ứng.'
    )

    if (!confirmed) return

    setHistoryOrdersBusy(true)
    setError('')
    setMessage('')

    try {
      await mileageApi.deleteShiftOrder(token, order.id)

      const result = await mileageApi.shiftOrders(
        token,
        selectedHistoryShiftId
      )

      setHistoryOrders(result.orders || [])
      setMessage('Đã xóa đơn hàng khỏi lịch sử.')
    } catch (err) {
      setError(err.message)
    } finally {
      setHistoryOrdersBusy(false)
    }
  }
  
  const loadVehicle = useCallback(async () => {
    const result = await mileageApi.getVehicle(token)
    const saved = result.vehicle
  
    setVehicle(saved)
  
    if (saved) {
      setVehicleName(saved.vehicle_name || '')
      setFuelType(saved.fuel_type)
      setFuelEfficiency(String(saved.fuel_efficiency))
    }
  }, [token])
  
  useEffect(() => {
    loadVehicle().catch((err) => setError(err.message))
  }, [loadVehicle])

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

  const handleSaveVehicle = async (event) => {
    event.preventDefault()
    
    const efficiency = Number(fuelEfficiency)
  
    if (!Number.isFinite(efficiency) || efficiency <= 0) {
      setError('Mức tiêu hao phải lớn hơn 0 km/lít.')
      return
    }
  
    setVehicleBusy(true)
    setError('')
    setMessage('')
  
    try {
      const result = await mileageApi.saveVehicle(token, {
        vehicle_name: vehicleName.trim(),
        fuel_type: fuelType,
        fuel_efficiency: efficiency,
      })
  
      setVehicle(result.vehicle)
      setMessage('Đã lưu cấu hình xe.')
      setPreview(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setVehicleBusy(false)
    }
  }

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

  const handleLoadLastOdo = async () => {
    setLastShiftBusy(true)
    setLastShiftMessage('')
    setError('')

    try {
      const result = await mileageApi.lastCompletedShift(token)
      const lastShift = result.last_shift

      if (!lastShift || lastShift.end_km === null || lastShift.end_km === undefined) {
        setLastShiftMessage(
          'Chưa có ca hoàn tất trước đó. Bạn có thể nhập ODO thủ công.'
        )
        return
      }

      setStartKm(String(lastShift.end_km))

      setLastShiftMessage(
        `Đã lấy ODO cuối ca trước: ${formatKm(lastShift.end_km)}`
      )
    } catch (err) {
      setError(err.message)
    } finally {
      setLastShiftBusy(false)
    }
  }

  const loadOrders = useCallback(async (shiftId = currentShift?.id) => {
    if (!shiftId) {
      setOrders([])
      return
    }

    const result = await mileageApi.shiftOrders(token, shiftId)
    setOrders(result.orders || [])
  }, [token, currentShift?.id])

  useEffect(() => {
    if (!currentShift?.id) {
      setOrders([])
      return
    }

    loadOrders(currentShift.id).catch((err) => {
      setError(err.message)
    })
  }, [currentShift?.id, loadOrders])

  const handleAddOrder = async (event) => {
    event.preventDefault()

    const values = [orderFare, orderBonus, orderTip]

    const valid = values.every(value =>
      /^\d+$/.test(String(value)) &&
      Number.isSafeInteger(Number(value))
    )

    if (!valid) {
      setError('Các khoản tiền phải là số nguyên không âm.')
      return
    }

    const order = {
      fare: Number(orderFare),
      bonus: Number(orderBonus),
      tip: Number(orderTip),
    }

    if (!Number.isSafeInteger(
      order.fare + order.bonus + order.tip
    )) {
      setError('Tổng thu nhập vượt giới hạn cho phép.')
      return
    }

    setOrderBusy(true)
    setError('')
    setMessage('')

    try {
      await mileageApi.createShiftOrder(
        token,
        currentShift.id,
        order
      )

      await loadOrders(currentShift.id)

      setOrderFare('')
      setOrderBonus('0')
      setOrderTip('0')

      setMessage('Đã lưu đơn hàng.')
    } catch (err) {
      setError(err.message)
    } finally {
      setOrderBusy(false)
    }
  }

  const handleDeleteOrder = async (order) => {
    const confirmed = window.confirm(
      'Bạn có chắc chắn muốn xóa đơn này khỏi lịch sử ca? Thu nhập của ca sẽ bị giảm tương ứng.'
    )

    if (!confirmed) return

    setOrderBusy(true)
    setError('')
    setMessage('')

    try {
      await mileageApi.deleteShiftOrder(token, order.id)

      await loadOrders(currentShift.id)

      setMessage('Đã xóa đơn hàng.')
    } catch (err) {
      setError(err.message)
    } finally {
      setOrderBusy(false)
    }
  }

  const handleEnd = async (event) => {
    event.preventDefault()
  
    setBusy(true)
    setError('')
    setMessage('')
    setPreview(null)
  
    try {
      const result = await mileageApi.previewFuel(
        token,
        currentShift.id,
        Number(endKm)
      )
  
      if (!result.price_available) {
        setManualMode(true)
        setError(
          `${result.error} Bạn có thể nhập giá nhiên liệu thủ công.`
        )
        return
      }
  
      setManualMode(false)
      setPreview(result)
    } catch (err) {
      setManualMode(true)
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }
  
  const handleManualPreview = async () => {
    const price = Number(manualPrice)
  
    if (!Number.isFinite(price) || price <= 0) {
      setError('Giá nhiên liệu phải lớn hơn 0.')
      return
    }
  
    setBusy(true)
    setError('')
    setPreview(null)
  
    try {
      const result = await mileageApi.previewFuel(
        token,
        currentShift.id,
        Number(endKm),
        price
      )
  
      if (!result.price_available) {
        throw new Error(result.error || 'Không thể tính chi phí.')
      }
  
      setPreview(result)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }
  
  const handleConfirmEnd = async () => {
    if (!preview?.quote_token) {
      setError('Vui lòng xem trước chi phí trước khi xác nhận.')
      return
    }
  
    setBusy(true)
    setError('')
  
    try {
      const shift = await endShift(
        currentShift.id,
        Number(endKm),
        preview.quote_token
      )
  
      setEndKm('')
      setPreview(null)
      setManualPrice('')
      setManualMode(false)
  
      setMessage(
        `Đã kết thúc ca. Quãng đường: ${formatKm(shift.distance_km)}. Chi phí nhiên liệu: ${formatVnd(shift.fuel_cost)}.`
      )
  
      await loadHistory()
    } catch (err) {
      setError(err.message)
  
      if (err.message.includes('Cấu hình xe đã thay đổi')) {
        setPreview(null)
        setManualMode(false)
      }
    } finally {
      setBusy(false)
    }
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

  const selectedHistoryShift = history.find(
    (shift) => shift.id === selectedHistoryShiftId
  )

  const historyOrderTotals = historyOrders.reduce(
    (totals, order) => ({
      count: totals.count + 1,
      fare: totals.fare + Number(order.fare || 0),
      bonus: totals.bonus + Number(order.bonus || 0),
      tip: totals.tip + Number(order.tip || 0),
      income: totals.income + Number(order.total_income || 0),
    }),
    { count: 0, fare: 0, bonus: 0, tip: 0, income: 0 }
  )

  const historyFuelCost = Number(selectedHistoryShift?.fuel_cost || 0)

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

            <form className="mileage-vehicle-card" onSubmit={handleSaveVehicle}>
              <div className="mileage-section-title">
                <strong>Cấu hình xe mặc định</strong>
                <span>{vehicle ? 'Đã cấu hình' : 'Chưa cấu hình'}</span>
              </div>
            
              <label htmlFor="mileage-vehicle-name">Tên xe (không bắt buộc)</label>
              <input
                id="mileage-vehicle-name"
                value={vehicleName}
                onChange={(event) => setVehicleName(event.target.value)}
                maxLength={80}
                placeholder="Ví dụ: Honda Vision"
              />
            
              <label htmlFor="mileage-fuel-type">Loại nhiên liệu</label>
              <select
                id="mileage-fuel-type"
                value={fuelType}
                onChange={(event) => {
                  setFuelType(event.target.value)
                  setPreview(null)
                }}
              >
                <option value="Dầu hỏa 2-K">Dầu hỏa 2-K</option>
                <option value="DO 0,001S Mức 5">DO 0,001S Mức 5</option>
                <option value="DO 0,05S Mức 2">DO 0,05S Mức 2</option>
                <option value="Xăng E10 RON 95 Mức 3">Xăng E10 RON 95 Mức 3</option>
                <option value="Xăng E10 RON 95 Mức 5">Xăng E10 RON 95 Mức 5</option>
                <option value="Xăng E5 RON 92 Mức 2">Xăng E5 RON 92 Mức 2</option>
              </select>
            
              <label htmlFor="mileage-fuel-efficiency">
                Mức tiêu hao (km/lít)
              </label>
              <input
                id="mileage-fuel-efficiency"
                type="number"
                min="0.01"
                step="0.01"
                required
                value={fuelEfficiency}
                onChange={(event) => {
                  setFuelEfficiency(event.target.value)
                  setPreview(null)
                }}
                placeholder="Ví dụ: 45"
              />
            
              <button
                className="mileage-primary-button"
                type="submit"
                disabled={vehicleBusy}
              >
                {vehicleBusy ? 'Đang lưu...' : 'Lưu cấu hình xe'}
              </button>
            </form>
           
            {currentShift ? (
              <>
                <div className="mileage-status-line"><span className="mileage-status-dot" />Đang trong ca làm việc</div>
                <div className="mileage-km-summary">
                  <div><span>Kilomet đầu ca</span><strong>{formatKm(currentShift.start_km)}</strong></div>
                  <div><span>Bắt đầu lúc</span><strong>{formatDateTime(currentShift.started_at)}</strong></div>
                </div>
                <div className="mileage-order-section">
                  <div className="mileage-section-title">
                    <strong>Quản lý đơn hàng</strong>
                    <span>{orders.length} đơn</span>
                  </div>

                  <form className="mileage-form" onSubmit={handleAddOrder}>
                    <label htmlFor="order-fare">Tiền đơn hàng (VNĐ)</label>
                    <input
                      id="order-fare"
                      type="number"
                      min="0"
                      step="1"
                      required
                      value={orderFare}
                      onChange={(event) => setOrderFare(event.target.value)}
                      placeholder="Ví dụ: 35000"
                    />

                    <label htmlFor="order-bonus">Tiền thưởng (VNĐ)</label>
                    <input
                      id="order-bonus"
                      type="number"
                      min="0"
                      step="1"
                      required
                      value={orderBonus}
                      onChange={(event) => setOrderBonus(event.target.value)}
                    />

                    <label htmlFor="order-tip">Tiền tip (VNĐ)</label>
                    <input
                      id="order-tip"
                      type="number"
                      min="0"
                      step="1"
                      required
                      value={orderTip}
                      onChange={(event) => setOrderTip(event.target.value)}
                    />

                    <button
                      type="submit"
                      className="mileage-primary-button"
                      disabled={orderBusy || orderFare === ''}
                    >
                      {orderBusy ? 'Đang lưu...' : '+ Thêm đơn'}
                    </button>
                  </form>

                  <div className="mileage-order-list">
                    {orders.length === 0 ? (
                      <p className="mileage-empty-copy">
                        Chưa có đơn hàng trong ca này.
                      </p>
                    ) : (
                      orders.map((order, index) => (
                        <article className="mileage-order-card" key={order.id}>
                          <div className="mileage-order-heading">
                            <strong>Đơn #{index + 1}</strong>
                            <small>{formatDateTime(order.created_at)}</small>
                          </div>

                          <div className="mileage-order-values">
                            <span>Tiền đơn: {formatVnd(order.fare)}</span>
                            <span>Thưởng: {formatVnd(order.bonus)}</span>
                            <span>Tip: {formatVnd(order.tip)}</span>
                          </div>

                          <div className="mileage-order-total">
                            <strong>{formatVnd(order.total_income)}</strong>

                            <button
                              type="button"
                              disabled={orderBusy}
                              onClick={() => handleDeleteOrder(order)}
                            >
                              Xóa
                            </button>
                          </div>
                        </article>
                      ))
                    )}
                  </div>

                  <div className="mileage-order-summary">
                    <span>Tổng thu nhập đơn hàng</span>
                    <strong>
                      {formatVnd(
                        orders.reduce(
                          (sum, order) => sum + Number(order.total_income || 0),
                          0
                        )
                      )}
                    </strong>
                  </div>
                </div>  
                  <form className="mileage-form" onSubmit={handleEnd}>
                    <label htmlFor="mileage-end-km">
                      Kilomet hiện tại khi kết thúc ca
                    </label>
                  
                    <input
                      id="mileage-end-km"
                      type="number"
                      inputMode="decimal"
                      min={currentShift.start_km}
                      max="10000000"
                      step="0.1"
                      required
                      value={endKm}
                      onChange={(event) => {
                        setEndKm(event.target.value)
                        setPreview(null)
                      }}
                      placeholder="Ví dụ: 12642.5"
                    />
                  
                    <button
                      className="mileage-primary-button"
                      type="submit"
                      disabled={busy || endKm === ''}
                    >
                      {busy ? 'Đang tính...' : 'Xem trước chi phí'}
                    </button>
                  </form>
                  
                  {manualMode && (
                    <div className="mileage-manual-price">
                      <label htmlFor="mileage-manual-price">
                        Giá nhiên liệu thủ công (đồng/lít)
                      </label>
                  
                      <input
                        id="mileage-manual-price"
                        type="number"
                        min="1"
                        step="1"
                        value={manualPrice}
                        onChange={(event) => {
                          setManualPrice(event.target.value)
                          setPreview(null)
                        }}
                        placeholder="Ví dụ: 20000"
                      />
                  
                      <button
                        type="button"
                        className="mileage-primary-button"
                        disabled={busy || manualPrice === ''}
                        onClick={handleManualPreview}
                      >
                        Tính lại chi phí
                      </button>
                    </div>
                  )}
                  
                  {preview?.preview && (
                    <div className="mileage-preview-card">
                      <h3>Xem trước chi phí ca làm việc</h3>
                  
                      {preview.preview.fuel_price_source === 'api' && (
                        <button
                          type="button"
                          className="mileage-manual-edit-button"
                          onClick={() => {
                            setManualPrice(String(preview.preview.fuel_price))
                            setManualMode(true)
                            setPreview(null)
                          }}
                        >
                          Chỉnh sửa giá thủ công
                        </button>
                      )}

                      <div>
                        <span>Loại nhiên liệu</span>
                        <strong>{preview.preview.fuel_type}</strong>
                      </div>
                  
                      <div>
                        <span>Quãng đường</span>
                        <strong>{formatKm(preview.preview.distance_km)}</strong>
                      </div>
                  
                      <div>
                        <span>Mức tiêu hao</span>
                        <strong>{preview.preview.fuel_efficiency} km/lít</strong>
                      </div>
                  
                      <div>
                        <span>Giá nhiên liệu</span>
                        <strong>{formatVnd(preview.preview.fuel_price)}/lít</strong>
                      </div>
                  
                      <div>
                        <span>Nhiên liệu tiêu thụ</span>
                        <strong>{formatFuel(preview.preview.fuel_consumed)}</strong>
                      </div>
                  
                      <div>
                        <span>Nguồn giá</span>
                        <strong>
                          {preview.preview.fuel_price_source === 'api'
                            ? 'API giá xăng'
                            : 'Nhập thủ công'}
                        </strong>
                      </div>
                  
                      <div className="mileage-preview-total">
                        <span>Chi phí nhiên liệu</span>
                        <strong>{formatVnd(preview.preview.fuel_cost)}</strong>
                      </div>
                  
                      <button
                        type="button"
                        className="mileage-danger-button"
                        disabled={busy}
                        onClick={handleConfirmEnd}
                      >
                        {busy ? 'Đang xác nhận...' : 'Xác nhận kết thúc ca'}
                      </button>
                    </div>
                  )}

                <p className="mileage-hint">Không thể kết thúc ca bằng số kilomet nhỏ hơn số đầu ca. Bạn chỉ có thể mở ca mới sau khi chốt ca hiện tại.</p>
              </>
            ) : (
              <>
                <div className="mileage-empty-state"><span>◷</span><strong>Bạn chưa bắt đầu ca nào</strong><p>Nhập số kilomet trên đồng hồ xe để bắt đầu ca mới.</p></div>
                {!vehicle && (
                  <p className="mileage-hint">
                    Bạn cần lưu cấu hình xe trước khi bắt đầu ca làm việc.
                  </p>
                )}
                <form className="mileage-form" onSubmit={handleStart}>
                  <label htmlFor="mileage-start-km">
                    Kilomet hiện tại khi bắt đầu ca
                  </label>

                  <input
                    id="mileage-start-km"
                    type="number"
                    inputMode="decimal"
                    min="0"
                    max="10000000"
                    step="0.1"
                    required
                    value={startKm}
                    onChange={(event) => setStartKm(event.target.value)}
                    placeholder="Ví dụ: 12580.5"
                  />

                  <button
                    type="button"
                    className="mileage-secondary-button"
                    disabled={lastShiftBusy}
                    onClick={handleLoadLastOdo}
                  >
                    {lastShiftBusy ? 'Đang lấy ODO...' : 'Lấy ODO từ ca trước'}
                  </button>

                  {lastShiftMessage && (
                    <p className="mileage-hint">{lastShiftMessage}</p>
                  )}

                  <button
                    className="mileage-primary-button"
                    type="submit"
                    disabled={busy || startKm === '' || !vehicle}
                  >
                    {busy ? 'Đang lưu...' : 'Bắt đầu ca'}
                  </button>
                </form>
              </>
            )}
          </div>
        )}

        {tab === 'history' && (
          <div className="mileage-panel-body">
            {!selectedHistoryShiftId ? (
              <>
                <div className="mileage-stats-grid">
                  <div>
                    <span>Hôm nay</span>
                    <strong>{formatKm(sumDistance(history, today))}</strong>
                  </div>
                  <div>
                    <span>7 ngày gần nhất</span>
                    <strong>{formatKm(sumDistance(history, weekStart))}</strong>
                  </div>
                  <div>
                    <span>Tháng này</span>
                    <strong>{formatKm(sumDistance(history, monthStart))}</strong>
                  </div>
                </div>

                <div className="mileage-section-title">
                  <strong>Lịch sử ca làm việc</strong>
                  <button
                    type="button"
                    onClick={() => loadHistory().catch((err) => setError(err.message))}
                  >
                    Làm mới
                  </button>
                </div>

                {history.length === 0 ? (
                  <p className="mileage-empty-copy">
                    Chưa có lịch sử ca làm việc.
                  </p>
                ) : (
                  <div className="mileage-table-wrap">
                    <table className="mileage-table">
                      <thead>
                        <tr>
                          <th>Thời gian</th>
                          <th>Đầu ca</th>
                          <th>Cuối ca</th>
                          <th>Quãng đường</th>
                          <th>Nhiên liệu</th>
                          <th>Chi phí</th>
                          <th>Trạng thái</th>
                          <th>Đơn hàng</th>
                        </tr>
                      </thead>

                      <tbody>
                        {history.map((shift) => (
                          <tr key={shift.id}>
                            <td>
                              {formatDateTime(shift.started_at)}
                              <small>
                                {shift.ended_at
                                  ? `→ ${formatDateTime(shift.ended_at)}`
                                  : 'Chưa kết thúc'}
                              </small>
                            </td>

                            <td>{formatKm(shift.start_km)}</td>
                            <td>{formatKm(shift.end_km)}</td>

                            <td>
                              <strong>{formatKm(shift.distance_km)}</strong>
                            </td>

                            <td>{formatFuel(shift.fuel_consumed)}</td>

                            <td>
                              <strong>{formatVnd(shift.fuel_cost)}</strong>
                              {shift.fuel_price_source && (
                                <small>
                                  {shift.fuel_price_source === 'api'
                                    ? 'API'
                                    : 'Thủ công'}
                                </small>
                              )}
                            </td>

                            <td>
                              <span className={`mileage-pill ${shift.status}`}>
                                {shift.status === 'active'
                                  ? 'Đang chạy'
                                  : 'Đã chốt'}
                              </span>
                            </td>

                            <td>
                              {shift.status === 'completed' && (
                                <button
                                  type="button"
                                  className="mileage-history-detail-button"
                                  onClick={() => handleOpenHistoryDetails(shift.id)}
                                >
                                  Xem đơn
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            ) : (
              <div className="mileage-history-detail-screen">
                <div className="mileage-section-title">
                  <button
                    type="button"
                    className="mileage-secondary-button"
                    onClick={handleBackToHistory}
                  >
                    ← Quay lại lịch sử
                  </button>

                  <strong>Chi tiết đơn hàng</strong>
                </div>

                {selectedHistoryShift && (
                  <div className="mileage-history-shift-meta">
                    <div>
                      <span>Thời gian bắt đầu</span>
                      <strong>
                        {formatDateTime(selectedHistoryShift.started_at)}
                      </strong>
                    </div>

                    <div>
                      <span>Thời gian kết thúc</span>
                      <strong>
                        {formatDateTime(selectedHistoryShift.ended_at)}
                      </strong>
                    </div>

                    <div>
                      <span>Quãng đường</span>
                      <strong>{formatKm(selectedHistoryShift.distance_km)}</strong>
                    </div>

                    <div>
                      <span>Nhiên liệu tiêu thụ</span>
                      <strong>{formatFuel(selectedHistoryShift.fuel_consumed)}</strong>
                    </div>
                  </div>
                )}

                <div className="mileage-history-orders">
                  <h4>Danh sách đơn hàng</h4>

                  {historyOrdersBusy ? (
                    <p className="mileage-empty-copy">
                      Đang tải đơn hàng...
                    </p>
                  ) : historyOrders.length === 0 ? (
                    <p className="mileage-empty-copy">
                      Ca này chưa có đơn hàng.
                    </p>
                  ) : (
                    <div className="mileage-order-list">
                      {historyOrders.map((order, index) => (
                        <article className="mileage-order-card" key={order.id}>
                          <div className="mileage-order-heading">
                            <strong>Đơn #{index + 1}</strong>
                            <small>{formatDateTime(order.created_at)}</small>
                          </div>

                          <div className="mileage-order-values">
                            <span>Tiền đơn: {formatVnd(order.fare)}</span>
                            <span>Thưởng: {formatVnd(order.bonus)}</span>
                            <span>Tip: {formatVnd(order.tip)}</span>
                          </div>

                          <div className="mileage-order-total">
                            <strong>{formatVnd(order.total_income)}</strong>

                            <button
                              type="button"
                              disabled={historyOrdersBusy}
                              onClick={() => handleDeleteHistoryOrder(order)}
                            >
                              Xóa
                            </button>
                          </div>
                        </article>
                      ))}
                    </div>
                  )}
                </div>
                <div className="mileage-history-income">
                  <div>
                    <span>Số đơn hàng</span>
                    <strong>{historyOrderTotals.count}</strong>
                  </div>

                  <div>
                    <span>Tiền đơn</span>
                    <strong>{formatVnd(historyOrderTotals.fare)}</strong>
                  </div>

                  <div>
                    <span>Tiền thưởng</span>
                    <strong>{formatVnd(historyOrderTotals.bonus)}</strong>
                  </div>

                  <div>
                    <span>Tiền tip</span>
                    <strong>{formatVnd(historyOrderTotals.tip)}</strong>
                  </div>

                  <div>
                    <span>Tổng thu nhập</span>
                    <strong>{formatVnd(historyOrderTotals.income)}</strong>
                  </div>

                  <div>
                    <span>Chi phí nhiên liệu</span>
                    <strong>{formatVnd(historyFuelCost)}</strong>
                  </div>

                  <div className="mileage-history-net">
                    <span>Thu nhập sau nhiên liệu</span>
                    <strong>
                      {formatVnd(historyOrderTotals.income - historyFuelCost)}
                    </strong>
                  </div>
                </div>
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
                    <th>Nhiên liệu</th>
                    <th>Chi phí</th>
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
                      <td>{formatFuel(shift.fuel_consumed)}</td>
                      <td>{formatVnd(shift.fuel_cost)}</td>
                      <td>{shift.status === 'active' ? 'Đang chạy' : 'Đã chốt'}</td>
                      <td>
                        {shift.status === 'completed' && (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => deleteShift(shift)}
                            style={{
                              color: '#c62828',
                              cursor: busy ? 'not-allowed' : 'pointer',
                              background: 'transparent',
                              border: 0,
                              padding: 0,
                              font: 'inherit',
                            }}
                          >
                            Xóa
                          </button>
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

  // Khóa cuộn trang chính khi mở modal
  useEffect(() => {
    if (!open) return

    const scrollY = window.scrollY
    const body = document.body
    const html = document.documentElement

    const previousBodyStyle = {
      position: body.style.position,
      top: body.style.top,
      left: body.style.left,
      right: body.style.right,
      width: body.style.width,
    }

    const previousHtmlOverflow = html.style.overflow

    body.style.position = 'fixed'
    body.style.top = `-${scrollY}px`
    body.style.left = '0'
    body.style.right = '0'
    body.style.width = '100%'
    html.style.overflow = 'hidden'

    return () => {
      body.style.position = previousBodyStyle.position
      body.style.top = previousBodyStyle.top
      body.style.left = previousBodyStyle.left
      body.style.right = previousBodyStyle.right
      body.style.width = previousBodyStyle.width
      html.style.overflow = previousHtmlOverflow

      window.scrollTo(0, scrollY)
    }
  }, [open])

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

