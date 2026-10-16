// Tiny Supabase client over fetch: only the three calls this app needs.
const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

export const isSupabaseConfigured = Boolean(url && key)

// Publishable keys go in `apikey`; legacy anon keys (JWTs) also need Authorization.
const auth: Record<string, string> = { apikey: key }
if (key?.startsWith('eyJ')) auth.Authorization = `Bearer ${key}`

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${url}${path}`, {
    ...init,
    headers: { ...auth, 'Content-Type': 'application/json', ...init.headers },
  })
  const body = await res.json().catch(() => null)
  if (!res.ok) {
    const step = path.startsWith('/storage') ? 'Upload' : path.startsWith('/functions') ? 'AI processing' : 'Database'
    throw new Error(`${step} (${res.status}): ${body?.message ?? body?.error ?? body?.msg ?? 'unknown error'}`)
  }
  return body
}

export type Entry = {
  id: number
  recorded_at: string
  duration_ms: number
  mime_type: string
  size_bytes: number
  audio_path: string
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

export const uploadAudio = (path: string, blob: Blob) =>
  request(`/storage/v1/object/recordings/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': blob.type },
    body: blob,
  })

// Runs the AI step for one entry and returns the updated row.
export const processEntry = (id: number) =>
  request<Entry>('/functions/v1/smart-responder', {
    method: 'POST',
    body: JSON.stringify({ id }),
  })
