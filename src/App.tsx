import { useEffect, useState } from 'react'
import { isSupabaseConfigured } from './lib/supabase'
import { Journal } from './pages/Journal'
import { Record } from './pages/Record'

function useHash() {
  const [hash, setHash] = useState(location.hash)
  useEffect(() => {
    const onChange = () => setHash(location.hash)
    addEventListener('hashchange', onChange)
    return () => removeEventListener('hashchange', onChange)
  }, [])
  return hash
}

function App() {
  const page = useHash() === '#/journal' ? 'journal' : 'record'

  return (
    <main>
      <nav>
        <span className="brand">Voice Diary</span>
        <a href="#/" className={page === 'record' ? 'active' : ''}>Record</a>
        <a href="#/journal" className={page === 'journal' ? 'active' : ''}>Journal</a>
      </nav>
      {!isSupabaseConfigured ? (
        <div className="card warning">
          <p><strong>Supabase is not connected.</strong></p>
          <p>
            Copy <code>.env.example</code> to <code>.env.local</code>, add your project URL and
            publishable key, then restart <code>npm run dev</code>.
          </p>
        </div>
      ) : page === 'record' ? (
        <Record />
      ) : (
        <Journal />
      )}
    </main>
  )
}

export default App
