import { useEffect, useState } from 'react'
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

export default function ClientInvoicePage({ invoiceId }: { invoiceId: string }) {
  const [invoice, setInvoice] = useState<Invoice | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    async function loadInvoice() {
      try {
        const response = await fetch(`/api/public/invoices/${encodeURIComponent(invoiceId)}`)
        const result = await response.json()

        if (!response.ok) throw new Error(result.error || 'Invoice not found.')

        setInvoice(result as Invoice)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not load invoice.')
      } finally {
        setLoading(false)
      }
    }

    loadInvoice()
  }, [invoiceId])

  if (loading) {
    return <main className="client-page"><p>Loading invoice…</p></main>
  }

  if (error || !invoice) {
    return (
      <main className="client-page">
        <h1>Invoice unavailable</h1>
        <p>{error || 'This invoice could not be found.'}</p>
      </main>
    )
  }

  return (
    <main className="client-page">
      <a className="client-brand" href="/dashboard">PayPal Freelancer Copilot</a>

      <section className="client-invoice-card">
        <p className="eyebrow">INVOICE {invoice.id}</p>
        <h1>Invoice from {invoice.client}</h1>
        <p className="client-description">{invoice.description}</p>

        <div className="client-invoice-details">
          <span>Due date</span>
          <strong>
            {new Date(`${invoice.dueDate}T12:00:00`).toLocaleDateString(
              'en-GB',
              { day: 'numeric', month: 'long', year: 'numeric' },
            )}
          </strong>

          <span>Amount due</span>
          <strong className="client-amount">{formatMoney(invoice.amount)}</strong>

          <span>Status</span>
          <strong>{invoice.status}</strong>
        </div>

        {invoice.status === 'Paid' ? (
          <p className="client-paid-message">This invoice has been paid. Thank you.</p>
        ) : (
          <div className="client-pay-area">
            <p>Pay securely using PayPal Sandbox:</p>
            <PayPalCheckoutButton
              invoiceId={invoice.id}
              onPaid={() => setInvoice({ ...invoice, status: 'Paid' })}
            />
          </div>
        )}
      </section>
    </main>
  )
}