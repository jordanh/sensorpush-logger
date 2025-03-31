import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import tsconfigPaths from 'vite-tsconfig-paths' // <-- Import plugin

export default defineConfig({
  plugins: [tsconfigPaths(), react(), tailwindcss()], // <-- Changed order
  server: {
    // Proxy API requests to the backend server running on port 8000
    proxy: {
      '/graphql': { // Assuming GraphQL endpoint is at /graphql
        target: 'http://localhost:8000',
        changeOrigin: true,
        secure: false,
        ws: true,
      },
    },
    port: 3000, // Optional: Define the port for the Vite dev server
  },
  // Optional: Specify the build output directory (defaults to 'dist')
  // build: {
  //   outDir: 'build'
  // }
})