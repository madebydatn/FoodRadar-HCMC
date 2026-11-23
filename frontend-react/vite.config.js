
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import {
  readFileSync,
  existsSync,
  mkdirSync,
  copyFileSync,
} from 'node:fs'
import { resolve } from 'node:path'

const restaurantFile = resolve(process.cwd(), '../restaurants.json')

const restaurantPlugin = {
  name: 'foodradar-restaurants',

  configureServer(server) {
    server.middlewares.use('/FoodRadar-HCMC/restaurants.json', (req, res) => {
      if (!existsSync(restaurantFile)) {
        res.statusCode = 404
        res.end('Không tìm thấy restaurants.json')
        return
      }

      res.setHeader('Content-Type', 'application/json; charset=utf-8')
      res.setHeader('Cache-Control', 'no-store')
      res.end(readFileSync(restaurantFile))
    })
  },

  closeBundle() {
    const outputDir = resolve(process.cwd(), 'dist')

    mkdirSync(outputDir, { recursive: true })

    if (existsSync(restaurantFile)) {
      copyFileSync(
        restaurantFile,
        resolve(outputDir, 'restaurants.json')
      )
    }
  },
}

export default defineConfig({
  plugins: [react(), restaurantPlugin],
  base: '/FoodRadar-HCMC/',
})
