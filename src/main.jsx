import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { installChunkReloadHandler } from './lib/chunk'
import './index.css'

// A lazy chunk's modulepreload can 404 after a deploy (old tab, new hashes) — reload once rather
// than let Vite throw an unhandled error. See src/lib/chunk.js.
installChunkReloadHandler()

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
