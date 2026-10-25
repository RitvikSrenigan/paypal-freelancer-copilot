import { useEffect, useMemo, useState, type FormEvent } from 'react'
import ClientInvoicePage from './ClientInvoicePage'
import Loginpage from './Loginpage'
import NotificationsPage from './Notifications'
import './App.css'

type Invoice = {
  id: string
  client: string
  description: string
  amount: number
  dueDate: string
  status: 'Unpaid' | 'Paid'
  archived?: boolean
}

type Page = 'dashboard' | 'notifications'

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

function App() {
  const [authenticated, setAuthenticated] = useState(false)
  const [checkingSession, setCheckingSession] = useState(true)
  const [loginError, setLoginError] = useState('')
  const [activePage, setActivePage] = useState<Page>(() =>
    window.location.pathname === '/notifications'
      ? 'notifications'
      : 'dashboard',
  )

  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [loadingInvoices, setLoadingInvoices] = useState(true)
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [copiedInvoiceId, setCopiedInvoiceId] = useState('')

  const [client, setClient] = useState('')
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [dueDate, setDueDate] = useState('')

  const today = getLocalDate()
  const activeInvoices = invoices.filter((invoice) => !invoice.archived)

  const paymentPageMatch = window.location.pathname.match(/^\/pay\/([^/]+)\/?$/)
  const paymentPageId = paymentPageMatch?.[1]

  useEffect(() => {
    function updatePageFromAddressBar() {
      setActivePage(
        window.location.pathname === '/notifications'
          ? 'notifications'
          : 'dashboard',
      )
    }

    window.addEventListener('popstate', updatePageFromAddressBar)
    return () => window.removeEventListener('popstate', updatePageFromAddressBar)
  }, [])

  useEffect(() => {
    // Client payment links do not require the freelancer login.
    if (window.location.pathname.match(/^\/pay\/[^/]+\/?$/)) {
      setCheckingSession(false)
      return
    }

    let cancelled = false

    async function checkSession() {
      try {
        const response = await fetch('/api/auth/me', {
          credentials: 'include',
        })
        const result = await response.json()

        if (!response.ok) {
          throw new Error(result.error || 'Could not check your login.')
        }

        if (!cancelled) {
          setAuthenticated(Boolean(result.authenticated))
        }
      } catch {
        if (!cancelled) {
          setLoginError(
            'Could not connect to the backend. Check that it is running.',
          )
        }
      } finally {
        if (!cancelled) setCheckingSession(false)
      }
    }

    void checkSession()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!authenticated) return

    let cancelled = false

    async function loadInvoices() {
      setLoadingInvoices(true)

      try {
        const response = await fetch('/api/invoices', {
          credentials: 'include',
        })

        if (response.status === 401) {
          setAuthenticated(false)
          setLoginError('Your session ended. Please sign in again.')
          return
        }

        const result = await response.json()

        if (!response.ok) {
          throw new Error(result.error || 'Could not load invoices.')
        }

        if (!cancelled) {
          setInvoices(result as Invoice[])
          setError('')
        }
      } catch {
        if (!cancelled) {
          setError('Could not connect to the backend. Check that it is running.')
        }
      } finally {
        if (!cancelled) setLoadingInvoices(false)
      }
    }

    void loadInvoices()

    return () => {
      cancelled = true
    }
  }, [authenticated])

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

  async function handleLogin(email: string, password: string) {
    setLoginError('')

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, password }),
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Could not sign in.')
      }

      setAuthenticated(true)
      setLoginError('')
    } catch (err) {
      setLoginError(
        err instanceof Error
          ? err.message
          : 'Could not connect to the backend. Check that it is running.',
      )
    }
  }

  async function handleLogout() {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include',
      })
    } finally {
      setAuthenticated(false)
      setInvoices([])
      setLoginError('')
      setActivePage('dashboard')
      window.history.pushState({}, '', '/dashboard')
    }
  }

  function navigateTo(page: Page) {
    setActivePage(page)
    window.history.pushState(
      {},
      '',
      page === 'notifications' ? '/notifications' : '/dashboard',
    )
  }

  async function createInvoice(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')

    try {
      const response = await fetch('/api/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          client: client.trim(),
          description: description.trim(),
          amount: Number(amount),
          dueDate,
        }),
      })

      const result = await response.json()

      if (response.status === 401) {
        setAuthenticated(false)
        setLoginError('Your session ended. Please sign in again.')
        return
      }

      if (!response.ok) {
        throw new Error(result.error || 'Could not save invoice.')
      }

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

  async function copyPaymentLink(invoiceId: string) {
    const link = `${window.location.origin}/pay/${encodeURIComponent(invoiceId)}`

    try {
      await navigator.clipboard.writeText(link)
      setCopiedInvoiceId(invoiceId)
      setError('')
      window.setTimeout(() => setCopiedInvoiceId(''), 2500)
    } catch {
      setError('Could not copy the link. Check your browser clipboard permissions.')
    }
  }

  async function clearPaidInvoice(invoiceId: string) {
    const confirmed = window.confirm(
      'Clear this paid invoice from the list? It will remain in your saved records and totals.',
    )

    if (!confirmed) return

    setError('')

    try {
      const response = await fetch(
        `/api/invoices/${encodeURIComponent(invoiceId)}/archive`,
        {
          method: 'PATCH',
          credentials: 'include',
        },
      )

      const result = await response.json()

      if (response.status === 401) {
        setAuthenticated(false)
        setLoginError('Your session ended. Please sign in again.')
        return
      }

      if (!response.ok) {
        throw new Error(result.error || 'Could not clear invoice.')
      }

      setInvoices((current) =>
        current.map((invoice) =>
          invoice.id === invoiceId ? { ...invoice, archived: true } : invoice,
        ),
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not clear invoice.')
    }
  }

  if (paymentPageId) {
    return (
      <ClientInvoicePage invoiceId={decodeURIComponent(paymentPageId)} />
    )
  }

  if (checkingSession) {
    return (
      <main className="login-page">
        <section className="login-card">
          <p>Checking your session…</p>
        </section>
      </main>
    )
  }

  if (!authenticated) {
    return <Loginpage onLogin={handleLogin} error={loginError} />
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a
          className="brand"
          href="/dashboard"
          onClick={(event) => {
            event.preventDefault()
            navigateTo('dashboard')
          }}
        >
          <span className="brand-icon">F</span>
          <span>PayPal Freelancer Copilot</span>
        </a>

        <p className="sidebar-label">WORKSPACE</p>

        <a
          className={`nav-link ${activePage === 'dashboard' ? 'active' : ''}`}
          href="/dashboard"
          onClick={(event) => {
            event.preventDefault()
            navigateTo('dashboard')
          }}
        >
          <span>▦</span> Overview
        </a>

        <a
          className={`nav-link ${activePage === 'notifications' ? 'active' : ''}`}
          href="/notifications"
          onClick={(event) => {
            event.preventDefault()
            navigateTo('notifications')
          }}
        >
          <span>▤</span> Notifications
        </a>

        <div className="sidebar-note">
          <span className="note-icon">✳</span>
          <strong>Your freelance finances, in focus.</strong>
          <p>Create invoices and keep track of what’s been paid.</p>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div className="breadcrumb">
            Workspace <span>/</span>
            {activePage === 'dashboard' ? 'Overview' : 'Notifications'}
          </div>

          <div className="topbar-actions">
            <span className="sandbox"><i /> Sandbox mode</span>
            <button className="cancel-button" onClick={handleLogout}>
              Log out
            </button>
          </div>
        </header>

        <section className="welcome">
          <div>
            <p className="eyebrow"><i /> YOUR FINANCE, IN FOCUS</p>
            <h1>
              {activePage === 'dashboard' ? 'Invoice overview' : 'Notifications'}
            </h1>
            <p className="welcome-subtitle">
              {activePage === 'dashboard'
                ? 'Create invoices and keep an eye on your payments.'
                : 'Upcoming invoice due dates and reminder drafts.'}
            </p>
          </div>
        </section>

        {error && (
          <p className="error-message" role="alert">
            {error}
          </p>
        )}

        {activePage === 'notifications' ? (
          <NotificationsPage invoices={activeInvoices} />
        ) : (
          <>
            <section className="metrics" aria-label="Invoice summary">
              <article className="metric-card">
                <div className="metric-heading">
                  <span>Total invoiced</span>
                  <b className="metric-icon purple">↗</b>
                </div>
                <strong>{formatMoney(totals.invoiced)}</strong>
                <small>
                  {invoices.length} invoice{invoices.length === 1 ? '' : 's'}
                </small>
              </article>

              <article className="metric-card">
                <div className="metric-heading">
                  <span>Received</span>
                  <b className="metric-icon green">✓</b>
                </div>
                <strong>{formatMoney(totals.received)}</strong>
                <small>Payments confirmed</small>
              </article>

              <article className="metric-card">
                <div className="metric-heading">
                  <span>Outstanding</span>
                  <b className="metric-icon amber">◷</b>
                </div>
                <strong>{formatMoney(totals.outstanding)}</strong>
                <small>Awaiting payment</small>
              </article>

              <article className="metric-card">
                <div className="metric-heading">
                  <span>Overdue</span>
                  <b className="metric-icon red">!</b>
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

              {loadingInvoices ? (
                <div className="empty-state">
                  <p>Loading invoices…</p>
                </div>
              ) : activeInvoices.length === 0 ? (
                <div className="empty-state">
                  <span className="empty-icon">▤</span>
                  <h3>
                    {invoices.length === 0
                      ? 'No invoices yet'
                      : 'All invoices cleared'}
                  </h3>
                  <p>
                    {invoices.length === 0
                      ? 'Create your first invoice using the button below.'
                      : 'Cleared paid invoices remain included in your totals.'}
                  </p>
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
                        <th>STATUS</th>
                        <th>CLIENT LINK</th>
                        <th>ACTIONS</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activeInvoices.map((invoice) => {
                        const overdue =
                          invoice.status === 'Unpaid' &&
                          invoice.dueDate < today

                        return (
                          <tr key={invoice.id}>
                            <td className="invoice-id">{invoice.id}</td>
                            <td className="client-name">{invoice.client}</td>
                            <td className="description">{invoice.description}</td>
                            <td className={overdue ? 'overdue-date' : ''}>
                              {new Date(
                                `${invoice.dueDate}T12:00:00`,
                              ).toLocaleDateString('en-GB', {
                                day: 'numeric',
                                month: 'short',
                                year: 'numeric',
                              })}
                            </td>
                            <td className="amount">
                              {formatMoney(invoice.amount)}
                            </td>
                            <td>
                              <span
                                className={`status ${
                                  overdue
                                    ? 'overdue'
                                    : invoice.status.toLowerCase()
                                }`}
                              >
                                {overdue ? 'Overdue' : invoice.status}
                              </span>
                            </td>
                            <td>
                              <button
                                className="copy-link-button"
                                onClick={() => copyPaymentLink(invoice.id)}
                              >
                                {copiedInvoiceId === invoice.id
                                  ? 'Link copied'
                                  : 'Copy payment link'}
                              </button>
                            </td>
                            <td>
                              {invoice.status === 'Paid' && (
                                <button
                                  className="clear-invoice-button"
                                  onClick={() => clearPaidInvoice(invoice.id)}
                                >
                                  Clear
                                </button>
                              )}
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
          </>
        )}
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