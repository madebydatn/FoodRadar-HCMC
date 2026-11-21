
export async function getRestaurants() {
  const restaurantUrl = `${import.meta.env.BASE_URL}restaurants.json`

  const response = await fetch(restaurantUrl, {
    cache: 'no-store',
  })

  if (!response.ok) {
    throw new Error('Không thể tải restaurants.json')
  }

  const json = await response.json()

  const restaurants = Array.isArray(json)
    ? json
    : json.data || []

  return restaurants.filter((item) => {
    const lat = Number(item.latitude ?? item.lat)
    const lng = Number(item.longitude ?? item.lng)

    return (
      Number.isFinite(lat) &&
      Number.isFinite(lng) &&
      lat >= -90 &&
      lat <= 90 &&
      lng >= -180 &&
      lng <= 180
    )
  })
}
