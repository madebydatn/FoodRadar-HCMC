
import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import { HeatLayer } from 'leaflet.heat'
import 'leaflet/dist/leaflet.css'

const GEOAPIFY_API_KEY = '3f76474ea82c43a1bda50def5e4b66a6'

const getId = (restaurant, index) =>
  String(restaurant.restaurant_id ?? restaurant.id ?? `index-${index}`)

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

      // Tạo popup an toàn bằng DOM
      const popup = document.createElement('div')

      const name = document.createElement('strong')
      name.textContent = restaurant.name || 'Quán ăn'

      const address = document.createElement('p')
      address.textContent = restaurant.address || 'Chưa có địa chỉ'

      const status = document.createElement('p')
      status.textContent = isOpen ? 'Đang mở' : 'Đã đóng'

      popup.append(name, address, status)

      const rating = Number(restaurant.rating)

      if (Number.isFinite(rating) && rating > 0) {
        const ratingElement = document.createElement('p')
        ratingElement.textContent = `Đánh giá: ${rating}`
        popup.append(ratingElement)
      }

      const url = restaurant.restaurant_url || restaurant.url

      if (typeof url === 'string') {
        try {
          const safeUrl = new URL(url)

          if (['http:', 'https:'].includes(safeUrl.protocol)) {
            const link = document.createElement('a')
            link.href = safeUrl.href
            link.target = '_blank'
            link.rel = 'noopener noreferrer'
            link.textContent = 'Xem quán ăn'
            popup.append(link)
          }
        } catch {
          // Bỏ qua URL không hợp lệ
        }
      }

      marker.bindPopup(popup)

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
