
import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import { HeatLayer } from 'leaflet.heat'
import 'leaflet/dist/leaflet.css'

const GEOAPIFY_API_KEY = '3f76474ea82c43a1bda50def5e4b66a6'

// =====================================================
// TIỆN ÍCH
// =====================================================

const getId = (restaurant, index) =>
  String(restaurant.restaurant_id ?? restaurant.id ?? `index-${index}`)

const formatTime = (time) => {
  if (typeof time !== 'string') return ''

  const match = time.match(/^([01]\d|2[0-3]):([0-5]\d)/)

  return match ? `${match[1]}:${match[2]}` : ''
}

const STATUS_COLORS = {
  open: {
    color: '#16865b',
    fillColor: '#22a06b',
  },
  closed: {
    color: '#dc2626',
    fillColor: '#ef4444',
  },
  unknown: {
    color: '#d97706',
    fillColor: '#f59e0b',
  },
}

// =====================================================
// TẠO NỘI DUNG POPUP
// =====================================================

const createRestaurantPopup = (restaurant, operatingStatus) => {
  const popup = document.createElement('div')
  popup.className = 'food-popup'

  const header = document.createElement('div')
  header.className = 'food-popup-header'

  const name = document.createElement('strong')
  name.className = 'food-popup-name'
  name.textContent = restaurant.name || 'Quán ăn'

  const status = document.createElement('span')

  const statusInfo = {
    open: {
      className: 'is-open',
      text: 'Đang mở',
    },
    closed: {
      className: 'is-closed',
      text: 'Đã đóng',
    },
    unknown: {
      className: 'is-unknown',
      text: 'Chưa rõ giờ',
    },
  }[operatingStatus] || {
    className: 'is-unknown',
    text: 'Chưa rõ giờ',
  }

  status.className = `food-popup-status ${statusInfo.className}`
  status.textContent = statusInfo.text

  header.append(name, status)
  popup.append(header)

  // Ảnh chỉ tải khi popup được mở
  const bannerId = restaurant.banner_mms_img_id
  const logoId = restaurant.logo_mms_img_id

  if (bannerId || logoId) {
    const image = document.createElement('img')

    image.className = 'food-popup-image'
    image.alt = restaurant.name
      ? `Ảnh ${restaurant.name}`
      : 'Ảnh quán ăn'

    image.loading = 'lazy'

    image.dataset.bannerUrl = bannerId
      ? `https://down-tx-vn.img.susercontent.com/${bannerId}@resize_ss640x400!@crop_w640_h400_cT`
      : ''

    image.dataset.logoUrl = logoId
      ? `https://down-tx-vn.img.susercontent.com/${logoId}@resize_ss640x400!@crop_w640_h400_cT`
      : ''

    image.onerror = () => {
      const fallbackUrl = image.dataset.logoUrl

      if (
        fallbackUrl &&
        image.dataset.triedLogo !== 'true' &&
        image.src !== fallbackUrl
      ) {
        image.dataset.triedLogo = 'true'
        image.src = fallbackUrl
      } else {
        image.remove()
      }
    }

    popup.append(image)
  }

  // Địa chỉ
  const address = document.createElement('div')
  address.className = 'food-popup-address'
  address.textContent = restaurant.address || 'Chưa có địa chỉ'

  popup.append(address)

  // Danh mục
  const categories = Array.isArray(restaurant.categories)
    ? restaurant.categories.filter(Boolean)
    : []

  if (categories.length > 0) {
    const category = document.createElement('div')

    category.className = 'food-popup-category'
    category.textContent = categories.join(' · ')

    popup.append(category)
  }

  // Giờ hoạt động
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

  // Đánh giá
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
      reviewText.textContent =
        `(${totalReview.toLocaleString('vi-VN')} đánh giá)`

      ratingRow.append(reviewText)
    }

    popup.append(ratingRow)
  }

  // Link quán
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

// =====================================================
// ĐIỀU CHỈNH VỊ TRÍ BẰNG CÁCH DI CHUYỂN BẢN ĐỒ
// =====================================================

// Popup luôn bám theo marker.
// Hàm này chỉ di chuyển bản đồ để đưa tâm popup
// về tâm vùng hiển thị của bản đồ.

const repositionMapForPopup = (map, popup) => {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      if (!map.hasLayer(popup)) return

      const popupElement = popup.getElement()

      if (!popupElement || !popupElement.isConnected) return

      const popupBox = popupElement.querySelector(
        '.leaflet-popup-content-wrapper'
      )

      if (!popupBox) return

      const mapRect = map.getContainer().getBoundingClientRect()
      const popupRect = popupBox.getBoundingClientRect()

      const mapCenterX = mapRect.left + mapRect.width / 2
      const mapCenterY = mapRect.top + mapRect.height / 2

      const popupCenterX = popupRect.left + popupRect.width / 2
      const popupCenterY = popupRect.top + popupRect.height / 2

      const offsetX = popupCenterX - mapCenterX
      const offsetY = popupCenterY - mapCenterY

      if (Math.abs(offsetX) < 2 && Math.abs(offsetY) < 2) {
        return
      }

      // Leaflet panBy di chuyển bản đồ theo hướng ngược
      // với hướng dịch chuyển của marker trên màn hình.
      // Popup và marker vì vậy luôn di chuyển cùng nhau.
      map.panBy(
        [offsetX, offsetY],
        {
          animate: true,
          duration: 0.35,
          easeLinearity: 0.25,
        }
      )
    })
  })
}

// =====================================================
// COMPONENT BẢN ĐỒ
// =====================================================

export default function RestaurantMap({
  restaurants = [],
  selectedRestaurant,
  onSelectRestaurant,
}) {
  const mapRef = useRef(null)
  const mapInstance = useRef(null)

  const markersLayer = useRef(null)
  const markersById = useRef(new Map())

  const heatLayer = useRef(null)
  const userLocationLayer = useRef(null)

  const onSelectRestaurantRef = useRef(onSelectRestaurant)

  const pendingMoveHandlerRef = useRef(null)

  const [selectionVersion, setSelectionVersion] = useState(0)

  const [showHeatmap, setShowHeatmap] = useState(false)
  const [heatMode, setHeatMode] = useState('density')
  const [locating, setLocating] = useState(false)
  const [locationError, setLocationError] = useState('')

  useEffect(() => {
    onSelectRestaurantRef.current = onSelectRestaurant
  }, [onSelectRestaurant])

  // =====================================================
  // 1. KHỞI TẠO BẢN ĐỒ
  // =====================================================

  useEffect(() => {
    if (mapInstance.current || !mapRef.current) return

    const map = L.map(mapRef.current, {
      zoomControl: false,
    }).setView([10.7769, 106.7009], 12)

    mapInstance.current = map

    // Click nền bản đồ để bỏ chọn quán
    map.on('click', () => {
      if (pendingMoveHandlerRef.current) {
        map.off('moveend', pendingMoveHandlerRef.current)
        pendingMoveHandlerRef.current = null
      }

      map.stop()
      map.closePopup()

      onSelectRestaurantRef.current?.(null)
    })

    L.control.zoom({
      position: 'bottomleft',
    }).addTo(map)

    L.tileLayer(
      `https://maps.geoapify.com/v1/tile/osm-bright/{z}/{x}/{y}.png?apiKey=${GEOAPIFY_API_KEY}`,
      {
        attribution: '© OpenStreetMap © Geoapify',
        maxZoom: 20,
      }
    ).addTo(map)

    markersLayer.current = L.layerGroup().addTo(map)
    userLocationLayer.current = L.layerGroup().addTo(map)

    // Khi popup mở: tải ảnh và điều chỉnh vị trí bản đồ
    map.on('popupopen', ({ popup }) => {
      const popupElement = popup.getElement()

      if (!popupElement?.querySelector('.food-popup')) return

      const image = popupElement.querySelector(
        '.food-popup-image'
      )

      if (image) {
        image.addEventListener(
          'load',
          () => {
            repositionMapForPopup(map, popup)
          },
          { once: true }
        )

        if (image.dataset.loaded !== 'true') {
          image.dataset.loaded = 'true'

          image.src =
            image.dataset.bannerUrl ||
            image.dataset.logoUrl
        }
      }

      // Căn theo kích thước popup hiện tại
      repositionMapForPopup(map, popup)
    })

    requestAnimationFrame(() => {
      map.invalidateSize()
    })

    return () => {
      if (pendingMoveHandlerRef.current) {
        map.off('moveend', pendingMoveHandlerRef.current)
        pendingMoveHandlerRef.current = null
      }

      map.remove()

      mapInstance.current = null
      markersLayer.current = null
      heatLayer.current = null
      userLocationLayer.current = null

      markersById.current.clear()
    }
  }, [])

  // =====================================================
  // 2. ĐỊNH VỊ VỊ TRÍ HIỆN TẠI
  // =====================================================

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

        L.circle(event.latlng, {
          radius: event.accuracy,
          color: '#2389d5',
          weight: 1,
          fillColor: '#2389d5',
          fillOpacity: 0.10,
        }).addTo(userLocationLayer.current)

        L.circleMarker(event.latlng, {
          radius: 8,
          color: '#ffffff',
          weight: 3,
          fillColor: '#1685d1',
          fillOpacity: 1,
          bubblingMouseEvents: false,
        })
          .bindPopup('Vị trí hiện tại của bạn')
          .addTo(userLocationLayer.current)
      }

      map.flyTo(
        event.latlng,
        Math.max(map.getZoom(), 16),
        {
          duration: 0.7,
        }
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

  // =====================================================
  // 3. TẠO VÀ CẬP NHẬT MARKER
  // =====================================================

  useEffect(() => {
    const map = mapInstance.current

    if (!map || !markersLayer.current) return

    markersLayer.current.clearLayers()
    markersById.current.clear()

    restaurants.forEach((restaurant, index) => {
      const lat = Number(
        restaurant.latitude ?? restaurant.lat
      )

      const lng = Number(
        restaurant.longitude ?? restaurant.lng
      )

      if (
        !Number.isFinite(lat) ||
        !Number.isFinite(lng) ||
        Math.abs(lat) > 90 ||
        Math.abs(lng) > 180
      ) {
        return
      }

      const id = getId(restaurant, index)

      const operatingStatus =
        restaurant.operatingStatus || 'unknown'

      const markerColor =
        STATUS_COLORS[operatingStatus] ||
        STATUS_COLORS.unknown

      const marker = L.circleMarker(
        [lat, lng],
        {
          radius: 7,
          color: markerColor.color,
          fillColor: markerColor.fillColor,
          fillOpacity: 0.9,
          weight: 1,
          bubblingMouseEvents: false,
        }
      )

      marker.options.restaurantId = id
      marker.options.operatingStatus = operatingStatus

      const popupContent = createRestaurantPopup(
        restaurant,
        operatingStatus
      )

      const popup = L.popup({
        className: 'foodradar-popup',
        minWidth: 220,
        maxWidth: 270,
        autoPan: false,
        closeButton: true,
      }).setContent(popupContent)

      marker.options.restaurantPopup = popup

      // Marker chỉ cập nhật lựa chọn.
      // Không tự mở popup hoặc di chuyển bản đồ tại đây.
      marker.on('click', () => {
        onSelectRestaurantRef.current?.(restaurant)

        setSelectionVersion((version) => version + 1)
      })

      marker.addTo(markersLayer.current)

      markersById.current.set(id, marker)
    })
  }, [restaurants])

  // =====================================================
  // 4. CẬP NHẬT HEATMAP
  // =====================================================

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
        const lat = Number(
          restaurant.latitude ?? restaurant.lat
        )

        const lng = Number(
          restaurant.longitude ?? restaurant.lng
        )

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
          intensity =
            restaurant.operatingStatus === 'open'
              ? 1
              : 0.2
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

  // =====================================================
  // 5. XỬ LÝ CHỌN QUÁN
  // =====================================================

  useEffect(() => {
    const map = mapInstance.current

    if (!map) return

    // Hủy chuyển động và listener cũ
    if (pendingMoveHandlerRef.current) {
      map.off('moveend', pendingMoveHandlerRef.current)
      pendingMoveHandlerRef.current = null
    }

    map.stop()

    // Đóng popup cũ
    map.closePopup()

    // Khôi phục trạng thái marker
    markersById.current.forEach((marker) => {
      const markerColor =
        STATUS_COLORS[marker.options.operatingStatus] ||
        STATUS_COLORS.unknown

      marker.setStyle({
        radius: 7,
        weight: 1,
        color: markerColor.color,
        fillColor: markerColor.fillColor,
      })
    })

    // Không còn quán được chọn
    if (!selectedRestaurant) {
      return
    }

    const selectedId = String(
      selectedRestaurant.restaurant_id ??
      selectedRestaurant.id ??
      ''
    )

    const marker = markersById.current.get(selectedId)

    if (!marker) return

    // Highlight marker nhưng giữ kích thước cố định
    marker.setStyle({
      radius: 7,
      weight: 2,
      color: '#f59e0b',
      fillColor: '#fbbf24',
    })

    const popup = marker.options.restaurantPopup

    if (!popup) return

    const markerPosition = marker.getLatLng()

    // Không tự động zoom out.
    // Nếu đang zoom nhỏ thì đưa về ít nhất mức 16.
    const targetZoom = Math.max(map.getZoom(), 16)

    let cancelled = false

    const openPopupAfterMove = () => {
      pendingMoveHandlerRef.current = null

      if (cancelled || !map.hasLayer(marker)) return

      popup
        .setLatLng(marker.getLatLng())
        .openOn(map)

      // popupopen sẽ tự tính kích thước và điều chỉnh
      // vị trí bản đồ để marker đến vị trí phù hợp.
    }

    const currentCenter = map.getCenter()
    const distance = currentCenter.distanceTo(markerPosition)

    // Nếu đã ở gần vị trí quán và đủ zoom
    if (
      distance < 1 &&
      map.getZoom() >= targetZoom
    ) {
      popup
        .setLatLng(markerPosition)
        .openOn(map)

      return () => {
        cancelled = true
      }
    }

    // Di chuyển đến quán trước, sau đó mở popup.
    pendingMoveHandlerRef.current = openPopupAfterMove

    map.once('moveend', openPopupAfterMove)

    map.flyTo(
      markerPosition,
      targetZoom,
      {
        duration: 0.7,
        easeLinearity: 0.25,
      }
    )

    return () => {
      cancelled = true

      if (pendingMoveHandlerRef.current === openPopupAfterMove) {
        map.off('moveend', openPopupAfterMove)
        pendingMoveHandlerRef.current = null
      }

      map.stop()
    }
  }, [selectedRestaurant, restaurants, selectionVersion])

  // =====================================================
  // 6. GIAO DIỆN
  // =====================================================

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
          className={
            showHeatmap
              ? 'map-tool active'
              : 'map-tool'
          }
          onClick={() =>
            setShowHeatmap((value) => !value)
          }
          aria-label={
            showHeatmap
              ? 'Tắt bản đồ nhiệt'
              : 'Bật bản đồ nhiệt'
          }
        >
          {showHeatmap ? 'Tắt nhiệt' : 'Bản đồ nhiệt'}
        </button>

        {showHeatmap && (
          <select
            value={heatMode}
            onChange={(e) =>
              setHeatMode(e.target.value)
            }
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
          title={
            locationError ||
            'Xác định vị trí hiện tại'
          }
        >
          {locating
            ? 'Đang tìm...'
            : '◎ Vị trí của tôi'}
        </button>
      </div>

      {locationError && (
        <div
          className="map-location-error"
          role="status"
        >
          {locationError}
        </div>
      )}
    </div>
  )
}
