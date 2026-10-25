import { useEffect, useState } from 'react'
import {
  PayPalButtons,
  PayPalScriptProvider,
  usePayPalScriptReducer,
} from '@paypal/react-paypal-js'

type Props = {
  invoiceId: string
  onPaid: () => void
}

type ApiResult = {
  clientId?: string
  id?: string
  error?: string
  captureStatus?: string
}

function CheckoutButtons({ invoiceId, onPaid }: Props) {
  const [error, setError] = useState('')
  const [{ isPending, isRejected }] = usePayPalScriptReducer()

  if (isPending) return <p className="paypal-loading">Loading PayPal checkout…</p>

  if (isRejected) {
    return (
      <p className="paypal-error" role="alert">
        PayPal could not load. Check your connection and Sandbox settings.
      </p>
    )
  }

  return (
    <div className="paypal-button">
      <PayPalButtons
        forceReRender={[invoiceId]}
        style={{ layout: 'vertical', label: 'paypal', shape: 'rect' }}
        createOrder={async () => {
          setError('')

          try {
            const response = await fetch('/api/paypal/orders', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ invoiceId }),
            })
            const result = (await response.json()) as ApiResult

            if (!response.ok || !result.id) {
              throw new Error(result.error || 'Could not start PayPal checkout.')
            }

            return result.id
          } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not start checkout.')
            throw err
          }
        }}
        onApprove={async (data) => {
          setError('')

          try {
            const response = await fetch(
              `/api/paypal/orders/${encodeURIComponent(data.orderID)}/capture`,
              { method: 'POST' },
            )
            const result = (await response.json()) as ApiResult

            if (!response.ok) {
              throw new Error(result.error || 'Could not complete payment.')
            }

            if (result.captureStatus === 'COMPLETED') {
              onPaid()
            } else {
              setError('Payment is not confirmed yet. The invoice remains unpaid.')
            }
          } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not complete payment.')
          }
        }}
        onCancel={() => setError('Payment cancelled. The invoice remains unpaid.')}
        onError={() => setError('PayPal checkout failed. Refresh and try again.')}
      />

      {error && <p className="paypal-error" role="alert">{error}</p>}
    </div>
  )
}

export default function PayPalCheckoutButton({ invoiceId, onPaid }: Props) {
  const [clientId, setClientId] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false

    async function loadClientId() {
      try {
        const response = await fetch('/api/paypal/client-id')
        const result = (await response.json()) as ApiResult

        if (!response.ok || !result.clientId) {
          throw new Error(result.error || 'PayPal client ID is missing.')
        }

        if (!cancelled) setClientId(result.clientId)
      } catch {
        if (!cancelled) {
          setError('PayPal could not load. Check the backend and Sandbox settings.')
        }
      }
    }

    loadClientId()

    return () => {
      cancelled = true
    }
  }, [])

  if (error) return <p className="paypal-error" role="alert">{error}</p>
  if (!clientId) return <p className="paypal-loading">Loading PayPal…</p>

  return (
    <PayPalScriptProvider
      options={{
        clientId,
        currency: 'GBP',
        intent: 'capture',
        components: 'buttons',
      }}
    >
      <CheckoutButtons invoiceId={invoiceId} onPaid={onPaid} />
    </PayPalScriptProvider>
  )
}