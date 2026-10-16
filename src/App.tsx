import { useEffect, useState } from 'react'
import { getSession, isSupabaseConfigured, onSessionChange, refreshUser, signOut } from './lib/supabase'
import { Journal } from './pages/Journal'
import { Login } from './pages/Login'
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
  const [session, setSession] = useState(getSession)
  useEffect(() => {
    onSessionChange(setSession)
    refreshUser().catch(() => {})
  }, [])

  if (!isSupabaseConfigured) {
    return (
      <main>
        <div className="card warning">
          <p><strong>Supabase is not connected.</strong></p>
          <p>
            Add <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_PUBLISHABLE_KEY</code> to{' '}
            <code>.env</code>, then restart <code>npm run dev</code>.
          </p>
        </div>
      </main>
    )
  }

  if (!session) {
    return (
      <main>
        <nav><span className="brand">Voice Diary</span></nav>
        <Login />
      </main>
    )
  }

  const demo = Boolean(session.user.app_metadata?.demo)

  return (
    <main>
      <nav>
        <span className="brand">Voice Diary</span>
        <a href="#/" className={page === 'record' ? 'active' : ''}>Record</a>
        <a href="#/journal" className={page === 'journal' ? 'active' : ''}>Journal</a>
        <button className="ghost" onClick={signOut}>Sign out</button>
      </nav>
      {/* key: switching accounts starts each page fresh */}
      {page === 'record' ? (
        <Record key={session.user.id} demo={demo} />
      ) : (
        <Journal key={session.user.id} demo={demo} />
      )}
    </main>
  )
}

export default App
