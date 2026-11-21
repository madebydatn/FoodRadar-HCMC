
import { useEffect, useMemo, useState } from 'react'
import { getRestaurants } from './services/restaurantService'
import RestaurantMap from './features/map/RestaurantMap'
import './App.css'

function App() {
  const [restaurants, setRestaurants] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('open')
  const [selectedRestaurant, setSelectedRestaurant] = useState(null)
  const [currentTime, setCurrentTime] = useState(new Date())

  // Đồng hồ thời gian thực
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date())
    }, 1000)

    return () => clearInterval(timer)
  }, [])

  const clockText = currentTime.toLocaleTimeString('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  })

  // Tải dữ liệu nhà hàng
  useEffect(() => {
    getRestaurants()
      .then(setRestaurants)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  // Lọc và tìm kiếm nhà hàng
  const filteredRestaurants = useMemo(() => {
    return restaurants.filter((item) => {
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
        (status === 'open' && item.is_open === true) ||
        (status === 'closed' && item.is_open === false)

      return matchesSearch && matchesStatus
    })
  }, [restaurants, search, status])

  const getRestaurantId = (item) =>
    String(item.restaurant_id ?? item.id ?? '')

  const selectedId = selectedRestaurant
    ? getRestaurantId(selectedRestaurant)
    : ''

  return (
    <main className="app">
      <header className="app-header">
        <div className="brand">
          <div className="brand-mark">F</div>

          <div className="brand-info">
            <h1>FoodRadar HCMC</h1>
            <p>Khám phá địa điểm ăn uống tại TP. Hồ Chí Minh</p>
          </div>
        </div>

        <div className="header-right">
          <div className="total-count">
            <strong>{restaurants.length.toLocaleString('vi-VN')}</strong>
            <span>Quán ăn</span>
          </div>

          <div className="header-clock">
            <span className="clock-icon">◷</span>
            <span>{clockText}</span>
          </div>
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
          <div className="map-panel">
            <div className="panel-label">
              <span className="live-dot" />
              BẢN ĐỒ KHÁM PHÁ
            </div>

            <RestaurantMap
              restaurants={filteredRestaurants}
              selectedRestaurant={selectedRestaurant}
              onSelectRestaurant={setSelectedRestaurant}
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

                return (
                  <article
                    className={`restaurant-card ${
                      isSelected ? 'selected' : ''
                    }`}
                    key={`${id || 'restaurant'}-${index}`}
                    onClick={() => setSelectedRestaurant(item)}
                    tabIndex={0}
                    role="button"
                    aria-pressed={isSelected}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        setSelectedRestaurant(item)
                      }
                    }}
                  >
                    <div className="restaurant-card-top">
                      <strong>{item.name || 'Quán ăn'}</strong>

                      <span className={item.is_open ? 'open' : 'closed'}>
                        <span className="status-dot" />
                        {item.is_open ? 'Đang mở' : 'Đã đóng'}
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
              <span>Khám phá ẩm thực địa phương</span>
              <span className="footer-credit">Made by DatN</span>
            </div>
          </aside>
        </section>
      )}
    </main>
  )
}

export default App
