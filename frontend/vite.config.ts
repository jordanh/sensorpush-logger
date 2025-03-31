import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Proxy API requests to the backend server running on port 8000
    proxy: {
      '/graphql': { // Assuming GraphQL endpoint is at /graphql
        target: 'http://localhost:8000',
        changeOrigin: true,
        // secure: false, // Uncomment if backend is not using HTTPS
        // ws: true, // Uncomment if you need WebSocket proxying (e.g., for GraphQL subscriptions)
      },
      // Add other API endpoints if needed
      // '/api': {
      //   target: 'http://localhost:8000',
      //   changeOrigin: true,
      // }
    },
    port: 3000, // Optional: Define the port for the Vite dev server
  },
  // Optional: Specify the build output directory (defaults to 'dist')
  // build: {
  //   outDir: 'build'
  // }
})