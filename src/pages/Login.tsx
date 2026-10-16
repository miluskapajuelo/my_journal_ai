import { useState, type FormEvent } from 'react'
import { signIn } from '../lib/supabase'

export function Login() {
  const [login, setLogin] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await signIn(login, password)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setBusy(false)
    }
  }

  return (
    <form className="card login" onSubmit={submit}>
      <h2>Sign in</h2>
      <input
        value={login}
        onChange={(e) => setLogin(e.target.value)}
        placeholder="Username or email"
        autoComplete="username"
        autoCapitalize="none"
        required
      />
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Password"
        autoComplete="current-password"
        required
      />
      <button type="submit" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
      {error && <p className="error">{error}</p>}
    </form>
  )
}
