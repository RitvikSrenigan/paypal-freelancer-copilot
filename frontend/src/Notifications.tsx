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

type NotificationsProps = {
  invoices: Invoice[]
}

type ReminderDraft = {
  invoiceId: string
  text: string
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

export default function Notifications({ invoices }: NotificationsProps) {
  const [draft, setDraft] = useState<ReminderDraft | null>(null)
  const [message, setMessage] = useState('')

  const today = getLocalDate()

  const reminders = invoices
    .filter((invoice) => !invoice.archived && invoice.status === 'Unpaid')
    .map((invoice) => ({
      invoice,
      days: daysUntilDue(invoice.dueDate, today),
    }))
    .filter(({ days }) => days === 3 || days === 1)

  function createDraft(invoice: Invoice) {
    const dueDate = new Date(`${invoice.dueDate}T12:00:00`).toLocaleDateString(
      'en-GB',
      { day: 'numeric', month: 'long', year: 'numeric' },
    )

    const text =
      `Hi ${invoice.client}, just a reminder that payment for ` +
      `${invoice.description} (${formatMoney(invoice.amount)}) is due ` +
      `${dueDate}. Please let me know if you have any questions. Thank you.`

    setDraft({ invoiceId: invoice.id, text })
    setMessage('')
  }

  async function copyDraft(text: string) {
    try {
      await navigator.clipboard.writeText(text)
      setMessage('Reminder draft copied.')
    } catch {
      setMessage(
        'Could not copy the draft. Check your browser clipboard permissions.',
      )
    }
  }

  return (
    <section className="invoice-panel">
      <div className="panel-heading">
        <div>
          <h2>Upcoming invoice reminders</h2>
          <p>Unpaid invoices due in three days or tomorrow.</p>
        </div>
      </div>

      {reminders.length === 0 ? (
        <div className="empty-state">
          <span className="empty-icon">✓</span>
          <h3>No upcoming reminders</h3>
          <p>Invoices due in one or three days will appear here.</p>
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
                <span>
                  Due{' '}
                  {new Date(`${invoice.dueDate}T12:00:00`).toLocaleDateString(
                    'en-GB',
                    { day: 'numeric', month: 'long', year: 'numeric' },
                  )}
                  {days === 1 ? ' — tomorrow' : ' — in 3 days'}
                </span>
              </div>

              {days === 1 && (
                <button
                  type="button"
                  className="primary-button"
                  onClick={() => createDraft(invoice)}
                >
                  Create reminder draft
                </button>
              )}

              {draft?.invoiceId === invoice.id && (
                <div className="reminder-draft">
                  <label htmlFor={`draft-${invoice.id}`}>Reminder draft</label>
                  <textarea
                    id={`draft-${invoice.id}`}
                    rows={4}
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

      {message && (
        <p className="notification-message" role="status">
          {message}
        </p>
      )}
    </section>
  )
}