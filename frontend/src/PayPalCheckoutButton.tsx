import { useEffect, useState } from 'react'
import {
  PayPalButtons,
  PayPalScriptProvider,
} from '@paypal/react-paypal-js'

type Props = {
  invoiceId: string
  onPaid: () => void
}

export default function PayPalCheckoutButton({ invoiceId, onPaid }: Props) {
  const [clientId, setClientId] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/paypal/client-id')
      .then(async (response) => {
        const result = await response.json()
        if (!response.ok) throw new Error(result.error || 'PayPal is unavailable.')
        setClientId(result.clientId)
      })
      .catch(() => {
        setError('Could not load PayPal. Check the backend and Sandbox settings.')
      })
  }, [])

  if (error) return <span className="paypal-error">{error}</span>
  if (!clientId) return <span className="paypal-loading">Loading PayPal…</span>

  return (
    <PayPalScriptProvider
      options={{ clientId, currency: 'GBP', intent: 'capture' }}
    >
      <div className="paypal-button">
        <PayPalButtons
          forceReRender={[invoiceId]}
          style={{ layout: 'horizontal', height: 34, tagline: false }}
          createOrder={async () => {
            setError('')
            const response = await fetch('/api/paypal/orders', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ invoiceId }),
            })
            const result = await response.json()
            if (!response.ok) throw new Error(result.error || 'Could not start payment.')
            return result.id as string
          }}
          onApprove={async (data) => {
            const response = await fetch(
              `/api/paypal/orders/${data.orderID}/capture`,
              { method: 'POST' },
            )
            const result = await response.json()

            if (!response.ok) {
              throw new Error(result.error || 'Could not complete payment.')
            }

            if (result.captureStatus === 'COMPLETED') {
              onPaid()
            } else {
              setError('Payment is not complete yet. The invoice remains unpaid.')
            }
          }}
          onError={() => {
            setError('PayPal checkout failed. Please try again.')
          }}
        />
        {error && <span className="paypal-error">{error}</span>}
      </div>
    </PayPalScriptProvider>
  )
}
