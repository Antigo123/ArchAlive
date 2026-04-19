import { createRoot } from 'react-dom/client'
import { inject } from '@vercel/analytics'
import { injectSpeedInsights } from '@vercel/speed-insights'
import './index.css'
import App from './App.tsx'

inject();
injectSpeedInsights();

createRoot(document.getElementById('root')!).render(<App />)
