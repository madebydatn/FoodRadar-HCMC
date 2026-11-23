
import { useEffect, useMemo, useRef, useState } from 'react'
import { getRestaurants } from './services/restaurantService'
import RestaurantMap from './features/map/RestaurantMap'
import { MileageHeader } from './features/mileage/MileageProvider'
import './App.css'

// Tọa độ mặc định của TP. Hồ Chí Minh
const DEFAULT_WEATHER_LOCATION = {
  latitude: 10.8231,
  longitude: 106.6297,
  label: 'TP. Hồ Chí Minh',
}

// Chuyển mã thời tiết WMO thành mô tả tiếng Việt
function getWeatherDescription(code, isDay) {
  if (code === 0) return { icon: isDay ? '☀️' : '🌙', description: 'Trời quang' }
  if (code === 1) return { icon: isDay ? '🌤️' : '🌙', description: 'Ít mây' }
  if (code === 2) return { icon: '⛅', description: 'Có mây' }
  if (code === 3) return { icon: '☁️', description: 'Nhiều mây' }
  if (code === 45 || code === 48) return { icon: '🌫️', description: 'Sương mù' }
  if ([51, 53, 55, 56, 57].includes(code)) return { icon: '🌦️', description: 'Mưa phùn' }
  if ([61, 63, 65, 66, 67].includes(code)) return { icon: '🌧️', description: 'Có mưa' }
  if ([71, 73, 75, 77, 85, 86].includes(code)) return { icon: '❄️', description: 'Tuyết' }
  if ([80, 81, 82].includes(code)) return { icon: '🌧️', description: 'Mưa rào' }
  if ([95, 96, 99].includes(code)) return { icon: '⛈️', description: 'Dông' }

  return { icon: '🌡️', description: 'Thời tiết hiện tại' }
}

// Chuyển giờ HH:mm hoặc HH:mm:ss thành số phút trong ngày
function parseTimeToMinutes(time) {
  if (typeof time !== 'string') return null

  const match = time.trim().match(/^([01]\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?$/)

  if (!match) return null

  return Number(match[1]) * 60 + Number(match[2])
}

// Lấy số phút hiện tại theo múi giờ Việt Nam
function getVietnamMinutes(date) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Ho_Chi_Minh',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)

  const hour = Number(parts.find((part) => part.type === 'hour')?.value)
  const minute = Number(parts.find((part) => part.type === 'minute')?.value)

  return hour * 60 + minute
}

// Tính trạng thái quán: open, closed hoặc unknown
function getRestaurantStatus(restaurant, now) {
  const operating = restaurant.operating || {}

  const openTime = parseTimeToMinutes(operating.open_time)
  const closeTime = parseTimeToMinutes(operating.close_time)

  // Thiếu giờ hoặc giờ không hợp lệ: chưa rõ
  if (openTime === null || closeTime === null) {
    return 'unknown'
  }

  // Giờ mở và đóng giống nhau: không đủ thông tin để kết luận
  if (openTime === closeTime) {
    return 'unknown'
  }

  const currentMinutes = getVietnamMinutes(now)

  // Quán hoạt động trong cùng một ngày
  if (openTime < closeTime) {
    return currentMinutes >= openTime && currentMinutes < closeTime
      ? 'open'
      : 'closed'
  }

  // Quán hoạt động qua đêm, ví dụ 18:00 - 02:00
  return currentMinutes >= openTime || currentMinutes < closeTime
    ? 'open'
    : 'closed'
}

function App() {
  const [restaurants, setRestaurants] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('open')
  const [selectedRestaurant, setSelectedRestaurant] = useState(null)
  const [currentTime, setCurrentTime] = useState(new Date())
  const [statusTime, setStatusTime] = useState(new Date())
  const [weatherLocation, setWeatherLocation] = useState(DEFAULT_WEATHER_LOCATION)
  const [weather, setWeather] = useState(null)
  const [weatherError, setWeatherError] = useState('')
  const mapPanelRef = useRef(null)

  // Quản lý chế độ sáng / tối (Light / Dark mode)
  const [theme, setTheme] = useState(() => {
    return (
      document.documentElement.getAttribute('data-theme') ||
      (() => {
        try {
          const saved = localStorage.getItem('foodradar-theme')
          if (saved === 'dark' || saved === 'light') return saved
          return window.matchMedia('(prefers-color-scheme: dark)').matches
            ? 'dark'
            : 'light'
        } catch {
          return 'light'
        }
      })()
    )
  })

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    try {
      localStorage.setItem('foodradar-theme', theme)
    } catch {
      // Bỏ qua lỗi nếu localStorage bị hạn chế
    }
    const metaThemeColor = document.querySelector('meta[name="theme-color"]')
    if (metaThemeColor) {
      metaThemeColor.setAttribute(
        'content',
        theme === 'dark' ? '#0b1320' : '#ffffff'
      )
    }
  }, [theme])

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'))
  }
  
  // Chọn quán và tự cuộn lên bản đồ trên điện thoại
  const handleSelectRestaurant = (item) => {
    setSelectedRestaurant(item)
  
    if (window.matchMedia('(max-width: 600px)').matches) {
      requestAnimationFrame(() => {
        mapPanelRef.current?.scrollIntoView({
          behavior: 'smooth',
          block: 'start',
        })
      })
    }
  }

  // Đồng hồ cập nhật mỗi giây
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date())
    }, 1000)
  
    return () => clearInterval(timer)
  }, [])
  
  // Trạng thái hoạt động chỉ tính lại mỗi phút
  useEffect(() => {
    const timer = setInterval(() => {
      setStatusTime(new Date())
    }, 60000)
  
    return () => clearInterval(timer)
  }, [])

  const clockText = currentTime.toLocaleTimeString('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  })
  
  const dateText = currentTime.toLocaleDateString('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
  
  // ========================================
  // THỜI TIẾT
  // ========================================
  useEffect(() => {
    const controller = new AbortController()
  
    const loadWeather = async () => {
      try {
        setWeatherError('')
  
        const params = new URLSearchParams({
          latitude: String(weatherLocation.latitude),
          longitude: String(weatherLocation.longitude),
          current: 'temperature_2m,weather_code,is_day',
          timezone: 'auto',
        })
  
        const response = await fetch(
          `https://api.open-meteo.com/v1/forecast?${params.toString()}`,
          { signal: controller.signal }
        )
  
        if (!response.ok) {
          throw new Error('Không thể tải dữ liệu thời tiết')
        }
  
        const data = await response.json()
        const current = data.current
  
        if (
          !current ||
          !Number.isFinite(Number(current.temperature_2m)) ||
          !Number.isFinite(Number(current.weather_code))
        ) {
          throw new Error('Dữ liệu thời tiết không hợp lệ')
        }
  
        const condition = getWeatherDescription(
          Number(current.weather_code),
          Number(current.is_day) === 1
        )
  
        setWeather({
          temperature: Math.round(Number(current.temperature_2m)),
          icon: condition.icon,
          description: condition.description,
        })
      } catch (error) {
        if (error.name !== 'AbortError') {
          setWeatherError('Chưa tải được thời tiết')
        }
      }
    }
  
    // Tải ngay lần đầu
    loadWeather()
  
    // Cập nhật mỗi 10 phút
    const timer = setInterval(loadWeather, 600000)
  
    return () => {
      controller.abort()
      clearInterval(timer)
    }
  }, [weatherLocation])

  // Tải dữ liệu nhà hàng
  useEffect(() => {
    getRestaurants()
      .then(setRestaurants)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  // Tính trạng thái từ giờ hoạt động, không dùng is_open của API
  const restaurantsWithStatus = useMemo(() => {
    return restaurants.map((item) => ({
      ...item,
      operatingStatus: getRestaurantStatus(item, statusTime),
    }))
  }, [restaurants, statusTime])

  // Lọc và tìm kiếm nhà hàng
  const filteredRestaurants = useMemo(() => {
    return restaurantsWithStatus.filter((item) => {
      const keyword = search.trim().toLowerCase()

      const searchFields = [
        item.name,
        item.address,
        ...(Array.isArray(item.categories) ? item.categories : []),
        ...(Array.isArray(item.cuisines) ? item.cuisines : []),
      ]

      const matchesSearch =
        !keyword ||
        searchFields.join(' ').toLowerCase().includes(keyword)

      const matchesStatus =
        status === 'all' ||
        (status === 'open' && item.operatingStatus === 'open') ||
        (status === 'closed' && item.operatingStatus === 'closed') ||
        (status === 'unknown' && item.operatingStatus === 'unknown')

      return matchesSearch && matchesStatus
    })
  }, [restaurantsWithStatus, search, status])

  const getRestaurantId = (item) =>
    String(item.restaurant_id ?? item.id ?? '')

  const selectedId = selectedRestaurant
    ? getRestaurantId(selectedRestaurant)
    : ''

  return (
    <main className="app">
      <header className="app-header">
        <div className="brand">
          <div className="brand-mark">
          <img
            src="./logo-web-512.png"
            alt="FoodRadar"
          />
        </div>

          <div className="brand-info">
            <h1>FoodRadar HCMC</h1>
            <p>Khám phá địa điểm ăn uống tại TP. Hồ Chí Minh</p>
          </div>

          <button
            type="button"
            className="theme-toggle mobile-theme-toggle"
            onClick={toggleTheme}
            title={
              theme === 'dark'
                ? 'Chuyển sang giao diện sáng'
                : 'Chuyển sang giao diện tối'
            }
            aria-label={
              theme === 'dark'
                ? 'Chuyển sang giao diện sáng'
                : 'Chuyển sang giao diện tối'
            }
          >
            <span className="theme-toggle-icon" aria-hidden="true">
              {theme === 'dark' ? '🌙' : '☀️'}
            </span>
          </button>
        </div>

        <div className="header-right">
          <div
            className="header-weather"
            title={weatherError || `Thời tiết tại ${weatherLocation.label}`}
            aria-live="polite"
          >
            <span className="weather-icon">
              {weather?.icon || '🌤️'}
            </span>
          
            <div className="weather-info">
              <strong>
                {weather ? `${weather.temperature}°C` : '--°C'}
              </strong>
          
              <span>
                {weather?.description ||
                  (weatherError ? 'Không có dữ liệu' : 'Đang tải thời tiết')}
              </span>
          
              <small>{weatherLocation.label}</small>
            </div>
          </div>

          <div className="header-clock">
            <span className="clock-icon">◷</span>
          
            <div className="clock-info">
              <strong className="clock-time">{clockText}</strong>
              <span className="clock-date">{dateText}</span>
            </div>
          </div>

          <button
            type="button"
            className="theme-toggle desktop-theme-toggle"
            onClick={toggleTheme}
            title={
              theme === 'dark'
                ? 'Chuyển sang giao diện sáng'
                : 'Chuyển sang giao diện tối'
            }
            aria-label={
              theme === 'dark'
                ? 'Chuyển sang giao diện sáng'
                : 'Chuyển sang giao diện tối'
            }
          >
            <span className="theme-toggle-icon" aria-hidden="true">
              {theme === 'dark' ? '🌙' : '☀️'}
            </span>
          </button>

          <MileageHeader />      
        </div>
      </header>

      {loading && (
        <div className="state-message">
          <div className="loading-spinner" />
          <p>Đang tải dữ liệu quán ăn...</p>
        </div>
      )}

      {error && (
        <div className="state-message error">
          Không thể tải dữ liệu: {error}
        </div>
      )}

      {!loading && !error && (
        <section className="main-layout">
          <div className="map-panel" ref={mapPanelRef}>
            <div className="panel-label">
              <span className="live-dot" />
              BẢN ĐỒ KHÁM PHÁ
            </div>

            <RestaurantMap
              restaurants={filteredRestaurants}
              selectedRestaurant={selectedRestaurant}
              onSelectRestaurant={setSelectedRestaurant}
              onUserLocationChange={(location) =>
                setWeatherLocation({
                  latitude: location.latitude,
                  longitude: location.longitude,
                  label: 'Vị trí của tôi',
                })
              }
            />
          </div>

          <aside className="restaurant-panel">
            <div className="restaurant-panel-header">
              <div className="discovery-heading">
                <div>
                  <span className="eyebrow">FOOD DISCOVERY</span>
                  <h2>Khám phá quán ăn</h2>
                  <p>Tìm địa điểm phù hợp với bạn</p>
                </div>
              </div>

              <div className="search-box">
                <span className="search-icon">⌕</span>

                <input
                  type="search"
                  placeholder="Tên quán ăn, địa chỉ, món ăn..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  aria-label="Tìm kiếm quán ăn"
                />

                {search && (
                  <button
                    className="clear-search"
                    onClick={() => setSearch('')}
                    aria-label="Xóa tìm kiếm"
                    type="button"
                  >
                    ×
                  </button>
                )}
              </div>

              <div className="filter-buttons">
                <button
                  className={status === 'all' ? 'active' : ''}
                  onClick={() => setStatus('all')}
                  type="button"
                >
                  Tất cả
                </button>
              
                <button
                  className={status === 'open' ? 'active' : ''}
                  onClick={() => setStatus('open')}
                  type="button"
                >
                  Đang mở
                </button>
              
                <button
                  className={status === 'closed' ? 'active' : ''}
                  onClick={() => setStatus('closed')}
                  type="button"
                >
                  Đã đóng
                </button>
              
                <button
                  className={status === 'unknown' ? 'active' : ''}
                  onClick={() => setStatus('unknown')}
                  type="button"
                >
                  Chưa rõ giờ
                </button>
              </div>

              <div className="list-heading">
                <strong>Danh sách quán ăn</strong>

                <span className="result-count">
                  {filteredRestaurants.length.toLocaleString('vi-VN')} kết quả
                </span>
              </div>
            </div>

            <div className="restaurant-list">
              {filteredRestaurants.map((item, index) => {
                const id = getRestaurantId(item)
                const isSelected =
                  selectedId !== '' && id === selectedId

                const statusClass = item.operatingStatus
                const statusText = {
                  open: 'Đang mở',
                  closed: 'Đã đóng',
                  unknown: 'Chưa rõ giờ',
                }[statusClass]

                return (
                  <article
                    className={`restaurant-card ${
                      isSelected ? 'selected' : ''
                    }`}
                    key={`${id || 'restaurant'}-${index}`}
                    onClick={() => handleSelectRestaurant(item)}
                    tabIndex={0}
                    role="button"
                    aria-pressed={isSelected}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        handleSelectRestaurant(item)
                      }
                    }}
                  >
                    <div className="restaurant-card-top">
                      <strong>{item.name || 'Quán ăn'}</strong>

                      <span className={statusClass}>
                        <span className="status-dot" />
                        {statusText}
                      </span>
                    </div>

                    <p className="restaurant-address">
                      <span>⌖</span>
                      {item.address || 'Chưa có địa chỉ'}
                    </p>

                    {item.rating != null && item.rating !== '' && (
                      <span className="rating">
                        ★ {item.rating}
                      </span>
                    )}
                  </article>
                )
              })}

              {filteredRestaurants.length === 0 && (
                <div className="empty">
                  <span>⌕</span>
                  <strong>Không tìm thấy quán ăn</strong>
                  <p>Thử thay đổi từ khóa hoặc bộ lọc nhé.</p>
                </div>
              )}
            </div>

            <div className="panel-footer">
              <strong>FoodRadar HCMC</strong>
              <span className="footer-credit">Made by DatN</span>
            </div>
          </aside>
        </section>
      )}
    </main>
  )
}

export default App
