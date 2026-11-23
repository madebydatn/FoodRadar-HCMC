import { StrictMode, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import { MileageProvider } from './features/mileage/MileageProvider.jsx'
import './index.css'

function Root() {
  useEffect(() => {
    if ('serviceWorker' in navigator && import.meta.env.PROD) {
      navigator.serviceWorker.register(
        `${import.meta.env.BASE_URL}sw.js`
      ).catch((error) => {
        console.error('Service Worker registration failed:', error)
      })
    }
  }, [])

  return (
    <MileageProvider>
      <App />
    </MileageProvider>
  )
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Root />
  </StrictMode>,
)
