// Tiny Supabase client over fetch: auth plus the few calls this app needs.
const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

export const isSupabaseConfigured = Boolean(url && key)

// Must match supabase/auth.sql.
export const DEMO_LIMIT = 2
// Logins without "@" are usernames, stored in Supabase as username@myjournalai.com.
const USERNAME_DOMAIN = 'myjournalai.com'

export type Session = {
  access_token: string
  refresh_token: string
  expires_at: number // unix seconds
  user: { id: string; email: string; app_metadata: { demo?: boolean } }
}

let session: Session | null = null
try {
  session = JSON.parse(localStorage.getItem('session') ?? 'null')
} catch {
  // storage unavailable (private mode): stay signed out
}
let listener: (s: Session | null) => void = () => {}

export const getSession = () => session
export const onSessionChange = (fn: (s: Session | null) => void) => {
  listener = fn
}

function setSession(s: Session | null) {
  session = s
  try {
    if (s) localStorage.setItem('session', JSON.stringify(s))
    else localStorage.removeItem('session')
  } catch {
    // session then lasts only until reload
  }
  listener(s)
}

async function authToken(grant: 'password' | 'refresh_token', body: object) {
  const res = await fetch(`${url}/auth/v1/token?grant_type=${grant}`, {
    method: 'POST',
    headers: { apikey: key, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await res.json().catch(() => null)
  if (!res.ok) throw new Error(data?.error_description ?? data?.msg ?? `HTTP ${res.status}`)
  setSession(data)
}

export function signIn(login: string, password: string) {
  const name = login.trim()
  const email = name.includes('@') ? name : `${name}@${USERNAME_DOMAIN}`
  return authToken('password', { email, password })
}

export function signOut() {
  const token = session?.access_token
  setSession(null)
  if (token) {
    fetch(`${url}/auth/v1/logout`, {
      method: 'POST',
      headers: { apikey: key, Authorization: `Bearer ${token}` },
    }).catch(() => {})
  }
}

// Returns a valid access token, refreshing it a minute before it expires.
async function accessToken() {
  if (!session) throw new Error('Not signed in')
  if (session.expires_at * 1000 < Date.now() + 60_000) {
    try {
      await authToken('refresh_token', { refresh_token: session.refresh_token })
    } catch (e) {
      setSession(null)
      throw e
    }
  }
  return session!.access_token
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${url}${path}`, {
    ...init,
    headers: {
      apikey: key,
      Authorization: `Bearer ${await accessToken()}`,
      'Content-Type': 'application/json',
      ...init.headers,
    },
  })
  const body = await res.json().catch(() => null)
  if (res.status === 401) setSession(null)
  if (!res.ok) {
    const step = path.startsWith('/storage') ? 'Upload' : path.startsWith('/functions') ? 'AI processing' : 'Database'
    throw new Error(`${step} (${res.status}): ${body?.message ?? body?.error ?? body?.msg ?? 'unknown error'}`)
  }
  return body
}

// Re-reads the signed-in user, e.g. to pick up a demo flag set after sign-in.
export async function refreshUser() {
  if (!session) return
  const user = await request<Session['user']>('/auth/v1/user')
  if (session) setSession({ ...session, user })
}

export type Entry = {
  id: number
  recorded_at: string
  duration_ms: number
  mime_type: string
  size_bytes: number
  audio_path: string | null
  lang: string | null
  transcript: string | null
  status: 'pending' | 'done' | 'error'
  bullets: string[] | null
  places: string[] | null
  people: string[] | null
  feeling_emoji: string | null
  feeling_label: string | null
  error: string | null
}

export const listEntries = () =>
  request<Entry[]>('/rest/v1/entries?select=*&order=recorded_at.desc&limit=300')

export const countEntries = async () =>
  (await request<{ id: number }[]>('/rest/v1/entries?select=id')).length

export async function addEntry(
  entry: Pick<Entry, 'recorded_at' | 'duration_ms' | 'mime_type' | 'size_bytes' | 'audio_path' | 'lang' | 'transcript'>,
) {
  const [row] = await request<Entry[]>('/rest/v1/entries', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(entry),
  })
  return row
}

// Deletes the row, then its audio file if it has one.
export async function deleteEntry(entry: Entry) {
  const rows = await request<Entry[]>(`/rest/v1/entries?id=eq.${entry.id}`, {
    method: 'DELETE',
    headers: { Prefer: 'return=representation' },
  })
  // Row-level security makes a forbidden delete match 0 rows instead of failing.
  if (!rows.length) throw new Error('This recording cannot be deleted.')
  if (entry.audio_path) {
    await request(`/storage/v1/object/recordings/${entry.audio_path}`, { method: 'DELETE' }).catch(() => {})
  }
}

// Uploads to the user's own folder and returns the storage path.
export async function uploadAudio(name: string, blob: Blob) {
  const path = `${session!.user.id}/${name}`
  await request(`/storage/v1/object/recordings/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': blob.type },
    body: blob,
  })
  return path
}

// Runs the AI step for one entry and returns the updated row.
export const processEntry = (id: number) =>
  request<Entry>('/functions/v1/smart-responder', {
    method: 'POST',
    body: JSON.stringify({ id }),
  })
