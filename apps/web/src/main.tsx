import React from 'react'
import ReactDOM from 'react-dom/client'
import { RouterProvider } from '@tanstack/react-router'
import { registerPwa } from './pwa'
import { router } from './router'
import { applyStoredAppearance } from './lib/appearance'
import './styles.css'

applyStoredAppearance()
registerPwa()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>,
)
