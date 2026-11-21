
import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import { HeatLayer } from 'leaflet.heat'
import 'leaflet/dist/leaflet.css'

const GEOAPIFY_API_KEY = '3f76474ea82c43a1bda50def5e4b66a6'

const getId = (restaurant, index) =>
  String(restaurant.restaurant_id ?? restaurant.id ?? `index-${index}`)

// Chuyển giờ dạng 09:00:00 thành 09:00
const formatTime = (time) => {
  if (typeof time !== 'string') return ''

  const match = time.match(/^([01]\d|2[0-3]):([0-5]\d)/)

  return match ? `${match[1]}:${match[2]}` : ''
}

// Tạo nội dung popup quán ăn
const createRestaurantPopup = (restaurant, isOpen) => {
  const popup = document.createElement('div')
  popup.className = 'food-popup'

  // Header: tên quán và trạng thái
  const header = document.createElement('div')
  header.className = 'food-popup-header'

  const name = document.createElement('strong')
  name.className = 'food-popup-name'
  name.textContent = restaurant.name || 'Quán ăn'

  const status = document.createElement('span')
  status.className = isOpen
    ? 'food-popup-status is-open'
    : 'food-popup-status is-closed'
  status.textContent = isOpen ? 'Đang mở' : 'Đã đóng'

  header.append(name, status)
  popup.append(header)

  // Địa chỉ
  const address = document.createElement('div')
  address.className = 'food-popup-address'
  address.textContent = restaurant.address || 'Chưa có địa chỉ'
  popup.append(address)

  // Loại hình quán
  const categories = Array.isArray(restaurant.categories)
    ? restaurant.categories.filter(Boolean)
    : []

  if (categories.length > 0) {
    const category = document.createElement('div')
    category.className = 'food-popup-category'
    category.textContent = categories.join(' · ')
    popup.append(category)
  }

  // Thời gian hoạt động
  const operating = restaurant.operating || {}
  const openTime = formatTime(operating.open_time)
  const closeTime = formatTime(operating.close_time)

  const hours = document.createElement('div')
  hours.className = 'food-popup-hours'

  const clockIcon = document.createElement('span')
  clockIcon.className = 'food-popup-icon'
  clockIcon.textContent = '◷'

  const hoursText = document.createElement('span')

  if (openTime && closeTime) {
    hoursText.textContent = `${openTime} – ${closeTime}`
  } else {
    hoursText.textContent = 'Chưa cập nhật giờ hoạt động'
    hours.classList.add('hours-unavailable')
  }

  hours.append(clockIcon, hoursText)
  popup.append(hours)

  // Đánh giá và số lượt đánh giá
  const rating = Number(restaurant.rating)

  if (Number.isFinite(rating) && rating > 0) {
    const ratingRow = document.createElement('div')
    ratingRow.className = 'food-popup-rating'

    const star = document.createElement('span')
    star.className = 'food-popup-star'
    star.textContent = '★'

    const ratingText = document.createElement('strong')
    ratingText.textContent = rating.toFixed(1)

    ratingRow.append(star, ratingText)

    const totalReview = Number(restaurant.total_review)

    if (Number.isFinite(totalReview) && totalReview > 0) {
      const reviewText = document.createElement('span')
      reviewText.className = 'food-popup-review'
      reviewText.textContent = `(${totalReview.toLocaleString('vi-VN')} đánh giá)`
      ratingRow.append(reviewText)
    }

    popup.append(ratingRow)
  }

  // Link xem quán ăn
  // Ưu tiên url vì restaurant_url trong dữ liệu hiện tại chỉ là slug
  const url = restaurant.url || restaurant.restaurant_url

  if (typeof url === 'string') {
    try {
      const safeUrl = new URL(url)

      if (['http:', 'https:'].includes(safeUrl.protocol)) {
        const link = document.createElement('a')
        link.className = 'food-popup-link'
        link.href = safeUrl.href
        link.target = '_blank'
        link.rel = 'noopener noreferrer'
        link.textContent = 'Xem quán ăn →'

        popup.append(link)
      }
    } catch {
      // Bỏ qua URL không hợp lệ
    }
  }

  return popup
}

export default function RestaurantMap({
  restaurants,
  selectedRestaurant,
  onSelectRestaurant,
}) {
  const mapRef = useRef(null)
  const mapInstance = useRef(null)
  const markersLayer = useRef(null)
  const markersById = useRef(new Map())
  const heatLayer = useRef(null)
  const userLocationLayer = useRef(null)

  const [showHeatmap, setShowHeatmap] = useState(false)
  const [heatMode, setHeatMode] = useState('density')
  const [locating, setLocating] = useState(false)
  const [locationError, setLocationError] = useState('')

  // Khởi tạo bản đồ
  useEffect(() => {
    if (mapInstance.current || !mapRef.current) return

    const map = L.map(mapRef.current, {
      zoomControl: false,
    }).setView([10.7769, 106.7009], 12)

    map.on('click', () => {
      onSelectRestaurant?.(null)
      map.closePopup()
    })

    // Chuyển nút zoom xuống góc dưới bên trái
    L.control.zoom({
      position: 'bottomleft',
    }).addTo(map)

    L.tileLayer(
      `https://maps.geoapify.com/v1/tile/positron/{z}/{x}/{y}.png?apiKey=${GEOAPIFY_API_KEY}`,
      {
        attribution: '© OpenStreetMap © Geoapify',
        maxZoom: 20,
      }
    ).addTo(map)

    markersLayer.current = L.layerGroup().addTo(map)
    userLocationLayer.current = L.layerGroup().addTo(map)
    mapInstance.current = map

    requestAnimationFrame(() => {
      map.invalidateSize()
    })

    return () => {
      map.remove()
      mapInstance.current = null
      markersLayer.current = null
      heatLayer.current = null
      userLocationLayer.current = null
      markersById.current.clear()
    }
  }, [])

  // Định vị vị trí hiện tại
  const handleLocateMe = () => {
    const map = mapInstance.current

    if (!map) return

    if (!navigator.geolocation) {
      setLocationError('Trình duyệt không hỗ trợ định vị')
      return
    }

    setLocating(true)
    setLocationError('')

    map.once('locationfound', (event) => {
      setLocating(false)
      setLocationError('')

      if (userLocationLayer.current) {
        userLocationLayer.current.clearLayers()

        // Vòng tròn thể hiện độ chính xác GPS
        L.circle(event.latlng, {
          radius: event.accuracy,
          color: '#2389d5',
          weight: 1,
          fillColor: '#2389d5',
          fillOpacity: 0.10,
        }).addTo(userLocationLayer.current)

        // Dấu chấm vị trí hiện tại
        L.circleMarker(event.latlng, {
          radius: 8,
          color: '#ffffff',
          weight: 3,
          fillColor: '#1685d1',
          fillOpacity: 1,
        })
          .bindPopup('Vị trí hiện tại của bạn')
          .addTo(userLocationLayer.current)
      }

      map.flyTo(
        event.latlng,
        Math.max(map.getZoom(), 16),
        { duration: 0.7 }
      )
    })

    map.once('locationerror', (event) => {
      setLocating(false)
      setLocationError(
        event.message || 'Không thể xác định vị trí hiện tại'
      )
    })

    map.locate({
      setView: false,
      enableHighAccuracy: true,
      timeout: 12000,
      maximumAge: 60000,
    })
  }

  // Cập nhật marker
  useEffect(() => {
    const map = mapInstance.current

    if (!map || !markersLayer.current) return

    markersLayer.current.clearLayers()
    markersById.current.clear()

    restaurants.forEach((restaurant, index) => {
      const lat = Number(restaurant.latitude ?? restaurant.lat)
      const lng = Number(restaurant.longitude ?? restaurant.lng)

      if (
        !Number.isFinite(lat) ||
        !Number.isFinite(lng) ||
        Math.abs(lat) > 90 ||
        Math.abs(lng) > 180
      ) {
        return
      }

      const id = getId(restaurant, index)
      const isOpen = restaurant.is_open === true

      const marker = L.circleMarker([lat, lng], {
        radius: 7,
        color: isOpen ? '#16865b' : '#64748b',
        fillColor: isOpen ? '#22a06b' : '#64748b',
        fillOpacity: 0.9,
        weight: 1,
      })

      marker.options.restaurantId = id

      // Popup thông tin quán ăn
      const popup = createRestaurantPopup(restaurant, isOpen)

      marker.bindPopup(popup, {
        className: 'foodradar-popup',
        minWidth: 220,
        maxWidth: 270,
        autoPan: true,
        closeButton: true,
      })

      marker.on('click', () => {
        onSelectRestaurant?.(restaurant)
      })

      marker.addTo(markersLayer.current)
      markersById.current.set(id, marker)
    })
  }, [restaurants, onSelectRestaurant])

  // Cập nhật Heatmap
  useEffect(() => {
    const map = mapInstance.current

    if (!map) return

    if (heatLayer.current) {
      map.removeLayer(heatLayer.current)
      heatLayer.current = null
    }

    if (!showHeatmap) return

    const points = restaurants
      .map((restaurant) => {
        const lat = Number(restaurant.latitude ?? restaurant.lat)
        const lng = Number(restaurant.longitude ?? restaurant.lng)
        const rating = Number(restaurant.rating)

        if (
          !Number.isFinite(lat) ||
          !Number.isFinite(lng) ||
          Math.abs(lat) > 90 ||
          Math.abs(lng) > 180
        ) {
          return null
        }

        let intensity = 1

        if (heatMode === 'open') {
          intensity = restaurant.is_open === true ? 1 : 0.2
        }

        if (heatMode === 'quality') {
          intensity = Number.isFinite(rating)
            ? Math.max(0.1, Math.min(rating / 5, 1))
            : 0.2
        }

        return [lat, lng, intensity]
      })
      .filter(Boolean)

    if (points.length === 0) return

    heatLayer.current = new HeatLayer(points, {
      radius: 27,
      blur: 22,
      maxZoom: 17,
      max: 1,
      minOpacity: 0.3,
      gradient: {
        0.2: '#2563eb',
        0.4: '#06b6d4',
        0.6: '#84cc16',
        0.8: '#facc15',
        1: '#ef4444',
      },
    }).addTo(map)
  }, [restaurants, showHeatmap, heatMode])

  // Chọn quán ăn và zoom bản đồ
  useEffect(() => {
    const map = mapInstance.current

    if (!map) return

    // Khôi phục style mặc định cho tất cả marker
    markersById.current.forEach((item) => {
      const restaurant = restaurants.find(
        (r, index) => getId(r, index) === item.options.restaurantId
      )

      item.setStyle({
        radius: 7,
        weight: 1,
        color: restaurant?.is_open === true ? '#16865b' : '#64748b',
        fillColor: restaurant?.is_open === true ? '#22a06b' : '#64748b',
      })
    })

    // Nếu không có quán được chọn thì dừng tại đây
    if (!selectedRestaurant) return

    const selectedId = String(
      selectedRestaurant.restaurant_id ?? selectedRestaurant.id ?? ''
    )

    const marker = markersById.current.get(selectedId)

    if (!marker) return

    // Highlight marker được chọn
    marker.setStyle({
      radius: 12,
      weight: 3,
      color: '#f59e0b',
      fillColor: '#fbbf24',
    })

    map.flyTo(marker.getLatLng(), Math.max(map.getZoom(), 16), {
      duration: 0.7,
    })

    marker.openPopup()
  }, [selectedRestaurant, restaurants])

  return (
    <div className="map-container">
      <div
        ref={mapRef}
        className="leaflet-map"
        style={{
          height: '100%',
          minHeight: '100%',
          width: '100%',
        }}
      />

      <div className="map-tools">
        <button
          type="button"
          className={showHeatmap ? 'map-tool active' : 'map-tool'}
          onClick={() => setShowHeatmap((value) => !value)}
          aria-label={showHeatmap ? 'Tắt bản đồ nhiệt' : 'Bật bản đồ nhiệt'}
        >
          {showHeatmap ? 'Tắt nhiệt' : 'Bản đồ nhiệt'}
        </button>

        {showHeatmap && (
          <select
            value={heatMode}
            onChange={(e) => setHeatMode(e.target.value)}
            aria-label="Chế độ bản đồ nhiệt"
          >
            <option value="density">Mật độ</option>
            <option value="open">Đang mở</option>
            <option value="quality">Chất lượng</option>
          </select>
        )}

        <button
          type="button"
          className="map-tool locate-button"
          onClick={handleLocateMe}
          disabled={locating}
          aria-label="Xác định vị trí của tôi"
          title={locationError || 'Xác định vị trí hiện tại'}
        >
          {locating ? 'Đang tìm...' : '◎ Vị trí của tôi'}
        </button>
      </div>

      {locationError && (
        <div className="map-location-error" role="status">
          {locationError}
        </div>
      )}
    </div>
  )
}
