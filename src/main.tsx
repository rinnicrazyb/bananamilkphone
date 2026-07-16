import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import 'jeep-sqlite/dist/jeep-sqlite/jeep-sqlite.esm.js';
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
