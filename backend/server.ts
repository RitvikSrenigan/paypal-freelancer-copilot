import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  CheckoutPaymentIntent,
  Client,
  Environment,
  OrdersController,
} from '@paypal/paypal-server-sdk';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;
const dataDirectory = path.join(process.cwd(), 'data');
const invoicesFile = path.join(dataDirectory, 'invoices.json');

type Invoice = {
  id: string;
  client: string;
  description: string;
  amount: number;
  dueDate: string;
  status: 'Unpaid' | 'Paid';
  paypalOrderId?: string;
  archived?: boolean;
};

const paypalClientId = process.env.PAYPAL_CLIENT_ID;
const paypalClientSecret = process.env.PAYPAL_CLIENT_SECRET;

const paypalClient =
  paypalClientId && paypalClientSecret
    ? new Client({
        clientCredentialsAuthCredentials: {
          oAuthClientId: paypalClientId,
          oAuthClientSecret: paypalClientSecret,
        },
        environment: Environment.Sandbox,
      })
    : null;

const ordersController = paypalClient
  ? new OrdersController(paypalClient)
  : null;

app.use(cors());
app.use(express.json());

async function readInvoices(): Promise<Invoice[]> {
  await mkdir(dataDirectory, { recursive: true });

  try {
    const contents = await readFile(invoicesFile, 'utf8');
    return JSON.parse(contents) as Invoice[];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      await writeFile(invoicesFile, '[]', 'utf8');
      return [];
    }

    throw error;
  }
}

async function saveInvoices(invoices: Invoice[]) {
  await mkdir(dataDirectory, { recursive: true });
  await writeFile(invoicesFile, JSON.stringify(invoices, null, 2), 'utf8');
}

app.get('/api/health', (_req, res) => {
  res.json({ status: 'OK', message: 'Freelancer Copilot Backend is active!' });
});

app.get('/api/invoices', async (_req, res) => {
  try {
    res.json(await readInvoices());
  } catch {
    res.status(500).json({ error: 'Could not load invoices.' });
  }
});

app.get('/api/public/invoices/:id', async (req, res) => {
  try {
    const invoices = await readInvoices();
    const invoice = invoices.find((item) => item.id === req.params.id);

    if (!invoice) {
      res.status(404).json({ error: 'Invoice not found.' });
      return;
    }

    res.json({
      id: invoice.id,
      client: invoice.client,
      description: invoice.description,
      amount: invoice.amount,
      dueDate: invoice.dueDate,
      status: invoice.status,
    });
  } catch {
    res.status(500).json({ error: 'Could not load invoice.' });
  }
});

app.post('/api/invoices', async (req, res) => {
  const { client, description, amount, dueDate } = req.body ?? {};

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
    });
    return;
  }

  try {
    const invoices = await readInvoices();
    const invoice: Invoice = {
      id: `FL-${randomUUID().slice(0, 8).toUpperCase()}`,
      client: client.trim(),
      description: description.trim(),
      amount: Number(amount),
      dueDate,
      status: 'Unpaid',
    };

    invoices.unshift(invoice);
    await saveInvoices(invoices);
    res.status(201).json(invoice);
  } catch {
    res.status(500).json({ error: 'Could not save the invoice.' });
  }
});

app.patch('/api/invoices/:id/archive', async (req, res) => {
  try {
    const invoices = await readInvoices();
    const invoice = invoices.find((item) => item.id === req.params.id);

    if (!invoice) {
      res.status(404).json({ error: 'Invoice not found.' });
      return;
    }

    if (invoice.status !== 'Paid') {
      res.status(409).json({ error: 'Only paid invoices can be cleared.' });
      return;
    }

    invoice.archived = true;
    await saveInvoices(invoices);
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Could not clear the invoice.' });
  }
});

app.get('/api/paypal/client-id', (_req, res) => {
  if (!paypalClientId) {
    res.status(503).json({ error: 'PayPal Sandbox is not configured.' });
    return;
  }

  res.json({ clientId: paypalClientId });
});

app.post('/api/paypal/orders', async (req, res) => {
  if (!ordersController) {
    res.status(503).json({ error: 'PayPal Sandbox is not configured.' });
    return;
  }

  const { invoiceId } = req.body ?? {};

  if (typeof invoiceId !== 'string') {
    res.status(400).json({ error: 'A valid invoice ID is required.' });
    return;
  }

  try {
    const invoices = await readInvoices();
    const invoice = invoices.find((item) => item.id === invoiceId);

    if (!invoice) {
      res.status(404).json({ error: 'Invoice not found.' });
      return;
    }

    if (invoice.status === 'Paid') {
      res.status(409).json({ error: 'This invoice is already paid.' });
      return;
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
    });

    const paypalOrder = JSON.parse(body) as { id?: string };

    if (!paypalOrder.id) {
      res.status(502).json({ error: 'PayPal did not return an order ID.' });
      return;
    }

    invoice.paypalOrderId = paypalOrder.id;
    await saveInvoices(invoices);
    res.status(201).json({ id: paypalOrder.id });
  } catch {
    console.error('PayPal could not create an order.');
    res.status(502).json({ error: 'Could not create the PayPal order.' });
  }
});

app.post('/api/paypal/orders/:orderId/capture', async (req, res) => {
  if (!ordersController) {
    res.status(503).json({ error: 'PayPal Sandbox is not configured.' });
    return;
  }

  const { orderId } = req.params;

  try {
    const invoices = await readInvoices();
    const invoice = invoices.find((item) => item.paypalOrderId === orderId);

    if (!invoice) {
      res.status(404).json({
        error: 'No invoice is linked to this PayPal order.',
      });
      return;
    }

    if (invoice.status === 'Paid') {
      res.json({
        invoiceId: invoice.id,
        captureStatus: 'COMPLETED',
        invoiceStatus: 'Paid',
      });
      return;
    }

    const { body } = await ordersController.captureOrder({
      id: orderId,
      prefer: 'return=representation',
    });

    const result = JSON.parse(body) as {
      purchase_units?: Array<{
        payments?: { captures?: Array<{ status?: string }> };
      }>;
    };

    const captureStatus =
      result.purchase_units?.[0]?.payments?.captures?.[0]?.status;

    if (captureStatus === 'COMPLETED') {
      invoice.status = 'Paid';
      await saveInvoices(invoices);
    }

    res.json({
      invoiceId: invoice.id,
      captureStatus: captureStatus ?? 'PENDING',
      invoiceStatus: invoice.status,
    });
  } catch {
    console.error('PayPal could not capture the order.');
    res.status(502).json({ error: 'Could not capture the PayPal payment.' });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});