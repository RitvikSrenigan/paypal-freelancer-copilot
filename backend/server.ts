import express, { type RequestHandler } from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import session from 'express-session'
import { rateLimit } from 'express-rate-limit'
import { randomUUID, timingSafeEqual } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import {
  CheckoutPaymentIntent,
  Client,
  Environment,
  OrdersController,
} from '@paypal/paypal-server-sdk'

dotenv.config()

declare module 'express-session' {
  interface SessionData {
    freelancerLoggedIn?: boolean
  }
}

const app = express()
const PORT = process.env.PORT || 5000
const dataDirectory = path.join(process.cwd(), 'data')
const invoicesFile = path.join(dataDirectory, 'invoices.json')

const sessionSecret = process.env.SESSION_SECRET
const freelancerEmail = process.env.FREELANCER_EMAIL
const freelancerPassword = process.env.FREELANCER_PASSWORD

if (!sessionSecret || !freelancerEmail || !freelancerPassword) {
  throw new Error(
    'Set SESSION_SECRET, FREELANCER_EMAIL, and FREELANCER_PASSWORD in backend/.env',
  )
}

if (Buffer.byteLength(sessionSecret) < 32) {
  throw new Error('SESSION_SECRET must be at least 32 characters long.')
}

type Invoice = {
  id: string
  client: string
  description: string
  amount: number
  dueDate: string
  status: 'Unpaid' | 'Paid'
  paypalOrderId?: string
  archived?: boolean
}

const paypalClientId = process.env.PAYPAL_CLIENT_ID
const paypalClientSecret = process.env.PAYPAL_CLIENT_SECRET

const paypalClient =
  paypalClientId && paypalClientSecret
    ? new Client({
        clientCredentialsAuthCredentials: {
          oAuthClientId: paypalClientId,
          oAuthClientSecret: paypalClientSecret,
        },
        environment: Environment.Sandbox,
      })
    : null

const ordersController = paypalClient
  ? new OrdersController(paypalClient)
  : null

app.use(
  cors({
    origin: 'http://localhost:5173',
    credentials: true,
  }),
)
app.use(express.json())

// This session store is for local development only.
// Choose a persistent session store before deploying the app.
app.use(
  session({
    name: 'freelancer.sid',
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 8 * 60 * 60 * 1000,
    },
  }),
)

function safeEqual(first: string, second: string) {
  const firstBuffer = Buffer.from(first)
  const secondBuffer = Buffer.from(second)

  return (
    firstBuffer.length === secondBuffer.length &&
    timingSafeEqual(firstBuffer, secondBuffer)
  )
}

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
})

const requireFreelancerLogin: RequestHandler = (req, res, next) => {
  if (!req.session.freelancerLoggedIn) {
    res.status(401).json({ error: 'Please log in.' })
    return
  }

  next()
}

app.post('/api/auth/login', loginLimiter, (req, res, next) => {
  const { email, password } = req.body ?? {}

  if (
    typeof email !== 'string' ||
    typeof password !== 'string' ||
    !safeEqual(
      email.trim().toLowerCase(),
      freelancerEmail.trim().toLowerCase(),
    ) ||
    !safeEqual(password, freelancerPassword)
  ) {
    res.status(401).json({ error: 'Email or password is incorrect.' })
    return
  }

  // Give the signed-in user a new session ID after successful login.
  req.session.regenerate((error) => {
    if (error) {
      next(error)
      return
    }

    req.session.freelancerLoggedIn = true

    req.session.save((saveError) => {
      if (saveError) {
        next(saveError)
        return
      }

      res.json({ authenticated: true })
    })
  })
})

app.get('/api/auth/me', (req, res) => {
  res.json({ authenticated: Boolean(req.session.freelancerLoggedIn) })
})

app.post('/api/auth/logout', (req, res, next) => {
  req.session.destroy((error) => {
    if (error) {
      next(error)
      return
    }

    res.clearCookie('freelancer.sid', {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
    })
    res.json({ authenticated: false })
  })
})

async function readInvoices(): Promise<Invoice[]> {
  await mkdir(dataDirectory, { recursive: true })

  try {
    const contents = await readFile(invoicesFile, 'utf8')
    return JSON.parse(contents) as Invoice[]
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      await writeFile(invoicesFile, '[]', 'utf8')
      return []
    }

    throw error
  }
}

async function saveInvoices(invoices: Invoice[]) {
  await mkdir(dataDirectory, { recursive: true })
  await writeFile(invoicesFile, JSON.stringify(invoices, null, 2), 'utf8')
}

app.get('/api/health', (_req, res) => {
  res.json({ status: 'OK', message: 'Freelancer Copilot Backend is active!' })
})

// Public client invoice page: it returns only the fields needed to display/pay.
app.get('/api/public/invoices/:id', async (req, res) => {
  try {
    const invoices = await readInvoices()
    const invoice = invoices.find((item) => item.id === req.params.id)

    if (!invoice) {
      res.status(404).json({ error: 'Invoice not found.' })
      return
    }

    res.json({
      id: invoice.id,
      client: invoice.client,
      description: invoice.description,
      amount: invoice.amount,
      dueDate: invoice.dueDate,
      status: invoice.status,
    })
  } catch {
    res.status(500).json({ error: 'Could not load invoice.' })
  }
})

// Everything under /api/invoices is for the signed-in freelancer.
app.use('/api/invoices', requireFreelancerLogin)

app.get('/api/invoices', async (_req, res) => {
  try {
    res.json(await readInvoices())
  } catch {
    res.status(500).json({ error: 'Could not load invoices.' })
  }
})

app.post('/api/invoices', async (req, res) => {
  const { client, description, amount, dueDate } = req.body ?? {}

  if (
    typeof client !== 'string' ||
    !client.trim() ||
    typeof description !== 'string' ||
    !description.trim() ||
    !Number.isFinite(Number(amount)) ||
    Number(amount) <= 0 ||
    typeof dueDate !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)
  ) {
    res.status(400).json({
      error: 'Enter a client, description, positive amount, and due date.',
    })
    return
  }

  try {
    const invoices = await readInvoices()
    const invoice: Invoice = {
      id: `FL-${randomUUID().slice(0, 8).toUpperCase()}`,
      client: client.trim(),
      description: description.trim(),
      amount: Number(amount),
      dueDate,
      status: 'Unpaid',
    }

    invoices.unshift(invoice)
    await saveInvoices(invoices)
    res.status(201).json(invoice)
  } catch {
    res.status(500).json({ error: 'Could not save the invoice.' })
  }
})

app.patch('/api/invoices/:id/archive', async (req, res) => {
  try {
    const invoices = await readInvoices()
    const invoice = invoices.find((item) => item.id === req.params.id)

    if (!invoice) {
      res.status(404).json({ error: 'Invoice not found.' })
      return
    }

    if (invoice.status !== 'Paid') {
      res.status(409).json({ error: 'Only paid invoices can be cleared.' })
      return
    }

    invoice.archived = true
    await saveInvoices(invoices)
    res.json({ success: true })
  } catch {
    res.status(500).json({ error: 'Could not clear the invoice.' })
  }
})

app.get('/api/paypal/client-id', (_req, res) => {
  if (!paypalClientId) {
    res.status(503).json({ error: 'PayPal Sandbox is not configured.' })
    return
  }

  res.json({ clientId: paypalClientId })
})

app.post('/api/paypal/orders', async (req, res) => {
  if (!ordersController) {
    res.status(503).json({ error: 'PayPal Sandbox is not configured.' })
    return
  }

  const { invoiceId } = req.body ?? {}

  if (typeof invoiceId !== 'string') {
    res.status(400).json({ error: 'A valid invoice ID is required.' })
    return
  }

  try {
    const invoices = await readInvoices()
    const invoice = invoices.find((item) => item.id === invoiceId)

    if (!invoice) {
      res.status(404).json({ error: 'Invoice not found.' })
      return
    }

    if (invoice.status === 'Paid') {
      res.status(409).json({ error: 'This invoice is already paid.' })
      return
    }

    const { body } = await ordersController.createOrder({
      body: {
        intent: CheckoutPaymentIntent.Capture,
        purchaseUnits: [
          {
            referenceId: invoice.id,
            description: invoice.description,
            amount: {
              currencyCode: 'GBP',
              value: invoice.amount.toFixed(2),
            },
          },
        ],
      },
      prefer: 'return=representation',
    })

    const paypalOrder = JSON.parse(body) as { id?: string }

    if (!paypalOrder.id) {
      res.status(502).json({ error: 'PayPal did not return an order ID.' })
      return
    }

    invoice.paypalOrderId = paypalOrder.id
    await saveInvoices(invoices)
    res.status(201).json({ id: paypalOrder.id })
  } catch {
    console.error('PayPal could not create an order.')
    res.status(502).json({ error: 'Could not create the PayPal order.' })
  }
})

app.post('/api/paypal/orders/:orderId/capture', async (req, res) => {
  if (!ordersController) {
    res.status(503).json({ error: 'PayPal Sandbox is not configured.' })
    return
  }

  const { orderId } = req.params

  try {
    const invoices = await readInvoices()
    const invoice = invoices.find((item) => item.paypalOrderId === orderId)

    if (!invoice) {
      res.status(404).json({
        error: 'No invoice is linked to this PayPal order.',
      })
      return
    }

    if (invoice.status === 'Paid') {
      res.json({
        invoiceId: invoice.id,
        captureStatus: 'COMPLETED',
        invoiceStatus: 'Paid',
      })
      return
    }

    const { body } = await ordersController.captureOrder({
      id: orderId,
      prefer: 'return=representation',
    })

    const result = JSON.parse(body) as {
      purchase_units?: Array<{
        payments?: { captures?: Array<{ status?: string }> }
      }>
    }

    const captureStatus =
      result.purchase_units?.[0]?.payments?.captures?.[0]?.status

    if (captureStatus === 'COMPLETED') {
      invoice.status = 'Paid'
      await saveInvoices(invoices)
    }

    res.json({
      invoiceId: invoice.id,
      captureStatus: captureStatus ?? 'PENDING',
      invoiceStatus: invoice.status,
    })
  } catch {
    console.error('PayPal could not capture the order.')
    res.status(502).json({ error: 'Could not capture the PayPal payment.' })
  }
})

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`)
})