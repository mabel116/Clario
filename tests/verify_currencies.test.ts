import { expect, test } from 'vitest';
import React from 'react';
import { renderToStream } from '@react-pdf/renderer';

import { InvoicePDFDocument } from '../src/components/InvoicePDFDocument';
import { InvoiceDetail, ClientDetail } from '../src/lib/data/types';
import { ProfileRow } from '../src/lib/sync/schema';
import { CURRENCIES } from '../src/lib/money/index';

const dummyProfile: ProfileRow = {
  id: 'test-user-id',
  business_name: 'Freelance Design Studio Inc',
  business_address: '123 Creative Studio Blvd, NY',
  default_currency: 'USD',
  created_at: '2026-08-01T00:00:00.000Z',
  updated_at: '2026-08-01T00:00:00.000Z'
};

const dummyClient: ClientDetail = {
  id: 'test-client-id',
  user_id: 'test-user-id',
  name: 'Acme Test Corporation',
  company: 'Acme Test Corp',
  email: 'billing@acmetest.com',
  phone: '+1-555-908-1122',
  notes: 'Some client summary note',
  default_currency: 'USD',
  created_at: '2026-08-01T00:00:00.000Z',
  updated_at: '2026-08-01T00:00:00.000Z',
  outstandingBalances: []
};

async function verifyPDFForCurrency(currency: string) {
  const dummyInvoice: InvoiceDetail = {
    id: 'test-inv-id',
    user_id: 'test-user-id',
    client_id: 'test-client-id',
    invoice_number: 'INV-PDF-TEST-999',
    status: 'sent',
    currency: currency,
    total_minor: currency === 'JPY' || currency === 'KRW' ? 100000 : 10000000, // 100,000 for zero decimals, else 100,000.00 minor
    issue_date: '2026-08-01',
    due_date: '2026-08-15',
    notes: 'TERMS: Net 15 days.',
    internal_note: 'SECRET_NEGOTIATION',
    created_at: '2026-08-01T00:00:00.000Z',
    updated_at: '2026-08-01T00:00:00.000Z',
    lineItems: [
      {
        id: 'li-1',
        user_id: 'test-user-id',
        invoice_id: 'test-inv-id',
        description: 'Premium Consulting Service Description',
        quantity: 2,
        unit_price_minor: currency === 'JPY' || currency === 'KRW' ? 50000 : 5000000,
        line_total_minor: currency === 'JPY' || currency === 'KRW' ? 100000 : 10000000,
        position: 0,
        created_at: '2026-08-01T00:00:00.000Z',
        updated_at: '2026-08-01T00:00:00.000Z'
      }
    ],
    displayStatus: 'sent',
    amountPaidMinor: 0,
    balanceDueMinor: currency === 'JPY' || currency === 'KRW' ? 100000 : 10000000,
    client_name: 'Acme Corporation'
  };

  const doc = React.createElement(InvoicePDFDocument, {
    invoice: dummyInvoice,
    profile: dummyProfile,
    client: dummyClient
  });

  const stream = await renderToStream(doc as any);
  const chunks: any[] = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  const buffer = Buffer.concat(chunks);

  const { PDFParse } = require('pdf-parse');
  const parser = new PDFParse({ data: buffer });
  const parsed = await parser.getText();
  const text = parsed.text;

  // Extract total and balance lines
  const lines = text.split('\n').map((l: string) => l.trim()).filter((l: string) => l.length > 0);
  const totalLines = lines.filter((l: string) => l.includes('Total') || l.includes('Balance Due') || l.includes('Subtotal'));
  
  return {
    text,
    totalLines
  };
}

test('verify glyph rendering for all target currencies', async () => {
  const currenciesToCheck = ['NGN', 'USD', 'JPY', 'EUR', 'GBP', 'KES', 'GHS', 'ZAR', 'CAD', 'AUD', 'INR', 'KRW'];
  console.log('\n--- VERIFYING CURRENCY GLYPHS IN GENERATED PDF ---');

  for (const cur of currenciesToCheck) {
    const symbol = CURRENCIES[cur].symbol;
    const { text, totalLines } = await verifyPDFForCurrency(cur);
    
    // Check if the symbol is in the text
    const containsSymbol = text.includes(symbol);
    console.log(`[${cur}] Symbol: ${symbol} | Found in PDF: ${containsSymbol ? 'YES' : 'NO'}`);
    totalLines.forEach((line: string) => {
      console.log(`   Line: ${line}`);
    });
    
    expect(containsSymbol).toBe(true);
  }
  console.log('--------------------------------------------------\n');
}, 60000);
