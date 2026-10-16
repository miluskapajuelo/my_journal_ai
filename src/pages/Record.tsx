import { useEffect, useRef, useState } from 'react'
import { addEntry, processEntry, uploadAudio, type Entry } from '../lib/supabase'
import { EntryView } from './Journal'

// Browser speech-to-text (Chrome, Edge, Safari). No extra service needed.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition

const LANGS = [
  ['es-ES', 'Español'],
  ['en-US', 'English'],
]

type Session = {
  stream: MediaStream
  rec: MediaRecorder
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sr: any
  chunks: Blob[]
  start: number
  final: string
  active: boolean
}

export function Record() {
  const [phase, setPhase] = useState<'idle' | 'recording' | 'saving' | 'processing'>('idle')
  const [lang, setLang] = useState(() => localStorage.getItem('lang') || 'es-ES')
  const [text, setText] = useState('')
  const [interim, setInterim] = useState('')
  const [elapsed, setElapsed] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<Entry | null>(null)
  const session = useRef<Session | null>(null)

  useEffect(() => {
    if (phase !== 'recording') return
    const t = setInterval(() => setElapsed(Date.now() - session.current!.start), 250)
    return () => clearInterval(t)
  }, [phase])

  async function start() {
    setError(null)
    setResult(null)
    setText('')
    setInterim('')
    setElapsed(0)
    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch {
      return setError('Microphone access was denied.')
    }
    const rec = new MediaRecorder(stream)
    const s: Session = { stream, rec, sr: null, chunks: [], start: Date.now(), final: '', active: true }
    rec.ondataavailable = (e) => s.chunks.push(e.data)
    rec.start()

    if (SpeechRecognition) {
      const sr = new SpeechRecognition()
      sr.lang = lang
      sr.continuous = true
      sr.interimResults = true
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      sr.onresult = (e: any) => {
        let partial = ''
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const r = e.results[i]
          if (r.isFinal) s.final += r[0].transcript.trim() + ' '
          else partial += r[0].transcript
        }
        setText(s.final)
        setInterim(partial)
      }
      // Recognition stops by itself after a pause; restart while recording.
      sr.onend = () => s.active && sr.start()
      sr.start()
      s.sr = sr
    }
    session.current = s
    setPhase('recording')
  }

  async function stop() {
    const s = session.current!
    s.active = false
    setPhase('saving')
    const duration = Date.now() - s.start

    const audio = new Promise<Blob>((resolve) => {
      s.rec.onstop = () => resolve(new Blob(s.chunks, { type: s.rec.mimeType || 'audio/webm' }))
      s.rec.stop()
    })
    // Wait for the last words to be recognized (max 2s).
    const speech = new Promise<void>((resolve) => {
      if (!s.sr) return resolve()
      s.sr.onend = () => resolve()
      s.sr.stop()
      setTimeout(resolve, 2000)
    })
    const [blob] = await Promise.all([audio, speech])
    s.stream.getTracks().forEach((t) => t.stop())
    setInterim('')

    try {
      const ext = blob.type.split('/')[1].split(';')[0]
      const path = `${crypto.randomUUID()}.${ext}`
      await uploadAudio(path, blob)

      const entry = await addEntry({
        recorded_at: new Date(s.start).toISOString(),
        duration_ms: duration,
        mime_type: blob.type,
        size_bytes: blob.size,
        audio_path: path,
        lang,
        transcript: s.final.trim(),
      })

      setPhase('processing')
      setResult(await processEntry(entry.id))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
    setPhase('idle')
  }

  const busy = phase === 'saving' || phase === 'processing'
  const secs = Math.floor(elapsed / 1000)

  return (
    <section>
      <div className="card center">
        <button
          className={`mic ${phase === 'recording' ? 'on' : ''}`}
          onClick={phase === 'recording' ? stop : start}
          disabled={busy}
          aria-label={phase === 'recording' ? 'Stop recording' : 'Start recording'}
        >
          <span />
        </button>
        <p className="status">
          {phase === 'recording'
            ? `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')} · tap to stop`
            : phase === 'saving'
              ? 'Saving…'
              : phase === 'processing'
                ? 'Understanding your day…'
                : 'Tap to record'}
        </p>
        <select
          value={lang}
          disabled={phase !== 'idle'}
          onChange={(e) => {
            setLang(e.target.value)
            localStorage.setItem('lang', e.target.value)
          }}
          aria-label="Language"
        >
          {LANGS.map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
        {!SpeechRecognition && (
          <p className="error">This browser has no speech-to-text. Use Chrome, Edge or Safari.</p>
        )}
      </div>

      {(text || interim) && (
        <div className="card transcript">
          {text}
          <span className="muted">{interim}</span>
        </div>
      )}
      {error && <p className="error">Error: {error}</p>}
      {result && (
        <div className="card">
          <EntryView entry={result} />
          <a href="#/journal" className="link">See your journal →</a>
        </div>
      )}
    </section>
  )
}
