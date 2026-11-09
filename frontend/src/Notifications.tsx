import { useState } from 'react'

type Invoice = {
  id: string
  client: string
  description: string
  amount: number
  dueDate: string
  status: 'Unpaid' | 'Paid'
  archived?: boolean
}

type Tone = 'friendly' | 'professional' | 'firm'

type Reminder = {
  invoice: Invoice
  days: number
}

type Props = {
  invoices: Invoice[]
}

function formatMoney(amount: number) {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
  }).format(amount)
}

function getLocalDate() {
  const date = new Date()
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function daysUntilDue(dueDate: string, today: string) {
  const due = new Date(`${dueDate}T12:00:00`)
  const current = new Date(`${today}T12:00:00`)
  return Math.round((due.getTime() - current.getTime()) / 86_400_000)
}

function getTiming(days: number) {
  if (days < 0) return 'overdue'
  if (days === 0) return 'today'
  if (days === 1) return 'tomorrow'
  return 'in 3 days'
}

function getTimingLabel(days: number) {
  if (days < 0) return `Overdue by ${Math.abs(days)} day${days === -1 ? '' : 's'}`
  if (days === 0) return 'Due today'
  if (days === 1) return 'Due tomorrow'
  return 'Due in 3 days'
}

export default function NotificationsPage({ invoices }: Props) {
  const [tone, setTone] = useState<Tone>('professional')
  const [draft, setDraft] = useState<{ invoiceId: string; text: string } | null>(
    null,
  )
  const [generatingId, setGeneratingId] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const today = getLocalDate()

  const reminders: Reminder[] = invoices
    .filter((invoice) => !invoice.archived && invoice.status === 'Unpaid')
    .map((invoice) => ({
      invoice,
      days: daysUntilDue(invoice.dueDate, today),
    }))
    .filter(({ days }) => days === 3 || days === 1 || days === 0 || days < 0)

  async function generateDraft(invoice: Invoice, days: number) {
    setGeneratingId(invoice.id)
    setError('')
    setMessage('')
    setDraft(null)

    try {
      const response = await fetch('/api/ai/reminder-draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          invoiceId: invoice.id,
          tone,
          timing: getTiming(days),
        }),
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Could not generate the draft.')
      }

      setDraft({ invoiceId: invoice.id, text: result.draft as string })
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Could not generate the draft.',
      )
    } finally {
      setGeneratingId('')
    }
  }

  async function copyDraft(text: string) {
    try {
      await navigator.clipboard.writeText(text)
      setMessage('Draft copied.')
    } catch {
      setError('Could not copy the draft. Check your browser clipboard permissions.')
    }
  }

  return (
    <section className="invoice-panel">
      <div className="panel-heading">
        <div>
          <h2>AI reminder writer</h2>
          <p>Generate an editable payment reminder from an invoice.</p>
        </div>
      </div>

      <div className="ai-reminder-controls">
        <label htmlFor="reminder-tone">Message tone</label>
        <select
          id="reminder-tone"
          value={tone}
          onChange={(event) => setTone(event.target.value as Tone)}
        >
          <option value="friendly">Friendly</option>
          <option value="professional">Professional</option>
          <option value="firm">Firm</option>
        </select>
      </div>

      {reminders.length === 0 ? (
        <div className="empty-state">
          <span className="empty-icon">✓</span>
          <h3>No reminders to draft</h3>
          <p>Unpaid invoices due in three days, tomorrow, today, or overdue appear here.</p>
        </div>
      ) : (
        <div className="notification-list">
          {reminders.map(({ invoice, days }) => (
            <article className="notification-item" key={invoice.id}>
              <div className="notification-details">
                <strong>{invoice.client}</strong>
                <p>
                  {invoice.id} · {invoice.description} ·{' '}
                  {formatMoney(invoice.amount)}
                </p>
                <span>{getTimingLabel(days)}</span>
                <p>
                  Due{' '}
                  {new Date(`${invoice.dueDate}T12:00:00`).toLocaleDateString(
                    'en-GB',
                    { day: 'numeric', month: 'long', year: 'numeric' },
                  )}
                </p>
              </div>

              <button
                type="button"
                className="primary-button"
                disabled={generatingId === invoice.id}
                onClick={() => void generateDraft(invoice, days)}
              >
                {generatingId === invoice.id
                  ? 'Generating…'
                  : 'Generate AI draft'}
              </button>

              {draft?.invoiceId === invoice.id && (
                <div className="reminder-draft">
                  <label htmlFor={`draft-${invoice.id}`}>Edit your draft</label>
                  <textarea
                    id={`draft-${invoice.id}`}
                    rows={5}
                    value={draft.text}
                    onChange={(event) => {
                      const text = event.target.value
                      setDraft((current) =>
                        current?.invoiceId === invoice.id
                          ? { ...current, text }
                          : current,
                      )
                    }}
                  />
                  <button
                    type="button"
                    className="copy-link-button"
                    onClick={() => void copyDraft(draft.text)}
                  >
                    Copy draft
                  </button>
                </div>
              )}
            </article>
          ))}
        </div>
      )}

      {error && (
        <p className="error-message" role="alert">
          {error}
        </p>
      )}
      {message && (
        <p className="notification-message" role="status">
          {message}
        </p>
      )}
    </section>
  )
}