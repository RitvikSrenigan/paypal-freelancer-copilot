import { useEffect, useMemo, useState, type FormEvent } from 'react'
import PayPalCheckoutButton from './PayPalCheckoutButton'
import './App.css'

type Invoice = {
  id: string
  client: string
  description: string
  amount: number
  dueDate: string
  status: 'Unpaid' | 'Paid'
}

function formatMoney(amount: number) {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
  }).format(amount)
}

function App() {
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)

  const [client, setClient] = useState('')
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [dueDate, setDueDate] = useState('')

  const today = new Date().toISOString().slice(0, 10)

  useEffect(() => {
    async function loadInvoices() {
      try {
        const response = await fetch('/api/invoices')
        if (!response.ok) throw new Error('Could not load invoices.')

        const data = (await response.json()) as Invoice[]
        setInvoices(data)
        setError('')
      } catch {
        setError('Could not connect to the backend. Check that it is running.')
      } finally {
        setLoading(false)
      }
    }

    loadInvoices()
  }, [])

  const totals = useMemo(() => {
    const unpaidInvoices = invoices.filter(
      (invoice) => invoice.status === 'Unpaid',
    )

    return {
      invoiced: invoices.reduce((sum, invoice) => sum + invoice.amount, 0),
      received: invoices
        .filter((invoice) => invoice.status === 'Paid')
        .reduce((sum, invoice) => sum + invoice.amount, 0),
      outstanding: unpaidInvoices.reduce(
        (sum, invoice) => sum + invoice.amount,
        0,
      ),
      overdue: unpaidInvoices.filter((invoice) => invoice.dueDate < today).length,
    }
  }, [invoices, today])

  async function createInvoice(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')

    try {
      const response = await fetch('/api/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client: client.trim(),
          description: description.trim(),
          amount: Number(amount),
          dueDate,
        }),
      })

      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Could not save invoice.')

      setInvoices((current) => [result as Invoice, ...current])
      setClient('')
      setDescription('')
      setAmount('')
      setDueDate('')
      setShowForm(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save invoice.')
    }
  }

  function markInvoicePaid(invoiceId: string) {
    setInvoices((current) =>
      current.map((invoice) =>
        invoice.id === invoiceId ? { ...invoice, status: 'Paid' } : invoice,
      ),
    )
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="dashboard">
          <span className="brand-icon">F</span>
          <span>PayPal Freelancer Copilot</span>
        </a>

        <p className="sidebar-label">WORKSPACE</p>
        <a className="nav-link active" href="dashboard">
          <span>▦</span> Overview
        </a>
        <a className="nav-link" href="invoices">
          <span>▤</span> Invoices
          <b>{invoices.length}</b>
        </a>

        <div className="sidebar-note">
          <span className="note-icon">✳</span>
          <strong>Your freelance finances, in focus.</strong>
          <p>Create invoices and keep track of what’s been paid.</p>
        </div>
      </aside>

      <main className="main-content" id="dashboard">
        <header className="topbar">
          <div className="breadcrumb">
            Workspace <span>/</span> Overview
          </div>
          <span className="sandbox"><i /> Sandbox mode</span>
        </header>

        <section className="welcome">
          <div>
            <p className="eyebrow"><i /> YOUR FINANCE, IN FOCUS</p>
            <h1>Invoice overview</h1>
            <p className="welcome-subtitle">
              Create invoices and keep an eye on your payments.
            </p>
          </div>
        </section>

        {error && <p className="error-message" role="alert">{error}</p>}

        <section className="metrics" aria-label="Invoice summary">
          <article className="metric-card">
            <div className="metric-heading">
              <span>Total invoiced</span><b className="metric-icon purple">↗</b>
            </div>
            <strong>{formatMoney(totals.invoiced)}</strong>
            <small>{invoices.length} invoice{invoices.length === 1 ? '' : 's'}</small>
          </article>

          <article className="metric-card">
            <div className="metric-heading">
              <span>Received</span><b className="metric-icon green">✓</b>
            </div>
            <strong>{formatMoney(totals.received)}</strong>
            <small>Payments confirmed</small>
          </article>

          <article className="metric-card">
            <div className="metric-heading">
              <span>Outstanding</span><b className="metric-icon amber">◷</b>
            </div>
            <strong>{formatMoney(totals.outstanding)}</strong>
            <small>Awaiting payment</small>
          </article>

          <article className="metric-card">
            <div className="metric-heading">
              <span>Overdue</span><b className="metric-icon red">!</b>
            </div>
            <strong>
              {totals.overdue}
              <em> invoice{totals.overdue === 1 ? '' : 's'}</em>
            </strong>
            <small>Unpaid past the due date</small>
          </article>
        </section>

        <section className="invoice-panel" id="invoices">
          <div className="panel-heading">
            <div>
              <h2>Invoices</h2>
              <p>Your invoices and their payment status.</p>
            </div>
          </div>

          {loading ? (
            <div className="empty-state">
              <p>Loading invoices…</p>
            </div>
          ) : invoices.length === 0 ? (
            <div className="empty-state">
              <span className="empty-icon">▤</span>
              <h3>No invoices yet</h3>
              <p>Create your first invoice using the button below.</p>
            </div>
          ) : (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>INVOICE</th>
                    <th>CLIENT</th>
                    <th>DESCRIPTION</th>
                    <th>DUE DATE</th>
                    <th>AMOUNT</th>
                    <th>PAYMENT</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((invoice) => {
                    const overdue =
                      invoice.status === 'Unpaid' && invoice.dueDate < today

                    return (
                      <tr key={invoice.id}>
                        <td className="invoice-id">{invoice.id}</td>
                        <td className="client-name">{invoice.client}</td>
                        <td className="description">{invoice.description}</td>
                        <td className={overdue ? 'overdue-date' : ''}>
                          {new Date(`${invoice.dueDate}T12:00:00`).toLocaleDateString(
                            'en-GB',
                            { day: 'numeric', month: 'short', year: 'numeric' },
                          )}
                        </td>
                        <td className="amount">{formatMoney(invoice.amount)}</td>
                        <td>
                          <div className="payment-cell">
                            <span
                              className={`status ${
                                overdue ? 'overdue' : invoice.status.toLowerCase()
                              }`}
                            >
                              {overdue ? 'Overdue' : invoice.status}
                            </span>

                            {invoice.status === 'Unpaid' && (
                              <PayPalCheckoutButton
                                invoiceId={invoice.id}
                                onPaid={() => markInvoicePaid(invoice.id)}
                              />
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div className="panel-create-action">
            <button
              className="primary-button"
              onClick={() => setShowForm(true)}
            >
              + Create invoice
            </button>
          </div>
        </section>
      </main>

      {showForm && (
        <div
          className="modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setShowForm(false)
          }}
        >
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="form-title"
          >
            <div className="modal-heading">
              <div>
                <p className="eyebrow">INVOICE DETAILS</p>
                <h2 id="form-title">Create an invoice</h2>
                <p className="modal-subtitle">
                  Enter the client and payment details.
                </p>
              </div>
              <button
                className="close-button"
                onClick={() => setShowForm(false)}
                aria-label="Close"
              >
                ×
              </button>
            </div>

            <form onSubmit={createInvoice}>
              <label>
                Client name
                <input
                  required
                  value={client}
                  onChange={(event) => setClient(event.target.value)}
                  placeholder="e.g. Northstar Studio"
                />
              </label>

              <label>
                Work description
                <input
                  required
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="e.g. Website design"
                />
              </label>

              <div className="form-row">
                <label>
                  Amount (GBP)
                  <input
                    required
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={amount}
                    onChange={(event) => setAmount(event.target.value)}
                    placeholder="350.00"
                  />
                </label>

                <label>
                  Due date
                  <input
                    required
                    type="date"
                    min={today}
                    value={dueDate}
                    onChange={(event) => setDueDate(event.target.value)}
                  />
                </label>
              </div>

              <div className="form-actions">
                <button
                  type="button"
                  className="cancel-button"
                  onClick={() => setShowForm(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="primary-button">
                  Save invoice <span>→</span>
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </div>
  )
}

export default App