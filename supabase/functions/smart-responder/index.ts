// Reads an entry's transcript, asks Claude to extract the day's facts, and saves them.
// Deploy: supabase functions deploy smart-responder --no-verify-jwt
// Secret: supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
import Anthropic from 'npm:@anthropic-ai/sdk'
import { createClient } from 'npm:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const anthropic = new Anthropic({ apiKey: Deno.env.get('_ANTHROPIC_API_KEY') })
const db = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

const list = { type: 'array', items: { type: 'string' } }
const schema = {
  type: 'object',
  properties: {
    bullets: list,
    places: list,
    people: list,
    feeling_emoji: { type: 'string' },
    feeling_label: { type: 'string' },
  },
  required: ['bullets', 'places', 'people', 'feeling_emoji', 'feeling_label'],
  additionalProperties: false,
}

const system = `You turn a spoken voice-journal note into a structured diary entry.
- bullets: short bullet points of what happened, in chronological order, written in the same language the person spoke. Keep the person's own facts; do not invent anything.
- places: places the person visited or was at (as specific as mentioned). Empty if none.
- people: people the person met or spent time with (names or roles like "my mom"). Empty if none.
- feeling_emoji: one emoji that best captures how the person felt.
- feeling_label: one or two words naming that feeling, same language as the note.`

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  const { id } = await req.json()
  const { data: entry } = await db
    .from('entries')
    .select('id, transcript, recorded_at')
    .eq('id', id)
    .neq('status', 'done')
    .single()
  if (!entry) return json({ error: 'Entry not found or already processed' }, 404)

  try {
    if (!entry.transcript?.trim()) throw new Error('No speech detected')

    const res = await anthropic.beta.messages.create({
      model: 'claude-opus-5-5',
      max_tokens: 8000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'low', format: { type: 'json_schema', schema } },
      system,
      messages: [
        {
          role: 'user',
          content: `Recorded at: ${entry.recorded_at}\n\nTranscript:\n${entry.transcript}`,
        },
      ],
    })
    if (res.stop_reason === 'refusal') throw new Error('The AI declined to process this note')
    const text = res.content.find((b) => b.type === 'text')
    if (!text || text.type !== 'text') throw new Error('Empty AI response')

    const out = JSON.parse(text.text)
    const { data, error } = await db
      .from('entries')
      .update({ ...out, status: 'done', error: null })
      .eq('id', id)
      .select()
      .single()
    if (error) throw error
    return json(data)
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    await db.from('entries').update({ status: 'error', error: message }).eq('id', id)
    return json({ error: message }, 500)
  }
})
