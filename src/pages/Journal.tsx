import { useEffect, useState } from 'react'
import { listEntries, processEntry, type Entry } from '../lib/supabase'

const time = (iso: string) =>
  new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })

const dayKey = (iso: string) => new Date(iso).toLocaleDateString('en-CA') // YYYY-MM-DD, local time

const dayTitle = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })

const unique = (lists: (string[] | null)[]) => [...new Set(lists.flatMap((l) => l ?? []))]

export function EntryView({ entry, onRetry }: { entry: Entry; onRetry?: () => void }) {
  return (
    <div className="entry">
      <div className="entry-head">
        <span className="time">{time(entry.recorded_at)}</span>
        {entry.feeling_emoji && (
          <span className="feeling" title={entry.feeling_label ?? ''}>
            {entry.feeling_emoji} <small>{entry.feeling_label}</small>
          </span>
        )}
      </div>
      {entry.status === 'pending' && <p className="muted">Processing…</p>}
      {entry.status === 'error' && (
        <p className="error">
          {entry.error}{' '}
          {onRetry && <button className="ghost" onClick={onRetry}>Retry</button>}
        </p>
      )}
      {entry.bullets && (
        <ul className="bullets">
          {entry.bullets.map((b, i) => <li key={i}>{b}</li>)}
        </ul>
      )}
      {entry.transcript && (
        <details>
          <summary className="muted">Transcript</summary>
          <p className="transcript">{entry.transcript}</p>
        </details>
      )}
    </div>
  )
}

function Chips({ icon, items }: { icon: string; items: string[] }) {
  if (!items.length) return null
  return (
    <div className="chips">
      <span className="chip-icon">{icon}</span>
      {items.map((t) => <span key={t} className="chip">{t}</span>)}
    </div>
  )
}

export function Journal() {
  const [entries, setEntries] = useState<Entry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let ignore = false
    listEntries()
      .then((data) => !ignore && setEntries(data))
      .catch((e) => !ignore && setError(e.message))
      .finally(() => !ignore && setLoading(false))
    return () => {
      ignore = true
    }
  }, [])

  async function retry(id: number) {
    setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, status: 'pending' } : e)))
    let next: Entry
    try {
      next = await processEntry(id)
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      next = { ...entries.find((x) => x.id === id)!, status: 'error', error: message }
    }
    setEntries((prev) => prev.map((e) => (e.id === id ? next : e)))
  }

  if (loading) return <p className="muted">Loading…</p>
  if (error) return <p className="error">Error: {error}</p>
  if (!entries.length) return <p className="muted">No recordings yet. Go record your first note.</p>

  const days = new Map<string, Entry[]>()
  for (const e of entries) {
    const k = dayKey(e.recorded_at)
    days.set(k, [...(days.get(k) ?? []), e])
  }

  return (
    <section>
      {[...days.values()].map((list) => {
        const chronological = [...list].reverse()
        return (
          <article key={dayKey(list[0].recorded_at)} className="card day">
            <header>
              <h2>{dayTitle(list[0].recorded_at)}</h2>
              <span className="emojis">{chronological.map((e) => e.feeling_emoji).join(' ')}</span>
            </header>
            <Chips icon="📍" items={unique(list.map((e) => e.places))} />
            <Chips icon="👥" items={unique(list.map((e) => e.people))} />
            {chronological.map((e) => (
              <EntryView key={e.id} entry={e} onRetry={() => retry(e.id)} />
            ))}
          </article>
        )
      })}
    </section>
  )
}
