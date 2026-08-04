// PROTOTYPE — throwaway entry point for prototype.html. Mounts the Campaign grid variants on
// their own so they can be viewed without Supabase. Remove with the prototype branch.
import React, { useState, useCallback } from 'react'
import ReactDOM from 'react-dom/client'
import '../index.css'
import CampaignGridPrototype, { readVariant } from './campaign-grid-prototype'

function Standalone() {
  const [variant, setVariant] = useState(() => readVariant() || 'A')
  const onVariant = useCallback((v) => {
    const u = new URL(window.location.href)
    u.searchParams.set('variant', v)
    window.history.replaceState({}, '', u)
    setVariant(v)
  }, [])
  const [dark, setDark] = useState(false)
  React.useEffect(() => { document.documentElement.classList.toggle('dark', dark) }, [dark])

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 p-6">
      <div className="max-w-[1400px] mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Campaign plan — grid variants</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">Standalone preview. The real surface is the Campaign tab.</p>
          </div>
          <button onClick={() => setDark(d => !d)} className="text-xs px-3 py-1.5 rounded border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300">
            {dark ? 'Light' : 'Dark'}
          </button>
        </div>
        <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700 p-6">
          <CampaignGridPrototype variant={variant} onVariant={onVariant} />
        </div>
      </div>
    </div>
  )
}

ReactDOM.createRoot(document.getElementById('root')).render(<React.StrictMode><Standalone /></React.StrictMode>)
