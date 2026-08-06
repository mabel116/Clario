import { expect, test } from 'vitest';
import React from 'react';
import { renderToStream } from '@react-pdf/renderer';

import { InvoicePDFDocument } from '../src/components/InvoicePDFDocument';
import { InvoiceDetail, ClientDetail } from '../src/lib/data/types';
import { ProfileRow } from '../src/lib/sync/schema';
import { sanitizeFilename } from '../src/lib/pdf/generator';

test('generates PDF and extracts text to verify notes inclusion and internal notes exclusion', async () => {
  const dummyInvoice: InvoiceDetail = {
    id: 'test-inv-id',
    user_id: 'test-user-id',
    client_id: 'test-client-id',
    invoice_number: 'INV-PDF-TEST-999',
    status: 'sent',
    currency: 'USD',
    total_minor: 15000,
    issue_date: '2026-08-01',
    due_date: '2026-08-15',
    notes: 'TERMS: Net 15 days. Public notes field is active.',
    internal_note: 'SECRET_NEGOTIATION_2026_DO_NOT_SHOW',
    created_at: '2026-08-01T00:00:00.000Z',
    updated_at: '2026-08-01T00:00:00.000Z',
    lineItems: [
      {
        id: 'li-1',
        user_id: 'test-user-id',
        invoice_id: 'test-inv-id',
        description: 'Premium Consulting Service Description',
        quantity: 2,
        unit_price_minor: 7500,
        line_total_minor: 15000,
        position: 0,
        created_at: '2026-08-01T00:00:00.000Z',
        updated_at: '2026-08-01T00:00:00.000Z'
      }
    ],
    displayStatus: 'sent',
    amountPaidMinor: 0,
    balanceDueMinor: 15000,
    client_name: 'Acme Test Corporation'
  };

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

  // 1. Generate the PDF document as a binary buffer
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
  
  // 2. Parse the PDF buffer using pdf-parse to extract raw text content
  const { PDFParse } = require('pdf-parse');
  const parser = new PDFParse({ data: buffer });
  const parsed = await parser.getText();
  const text = parsed.text;

  // 3. Verification Assertions (as per Criterion 3)
  // Ensure the extracted text is non-empty
  expect(text).toBeDefined();
  expect(text.length).toBeGreaterThan(0);

  // Assert it contains expected metadata (so extraction is validated as functional)
  expect(text).toContain('INV-PDF-TEST-999');
  expect(text).toContain('Acme Test Corporation');
  expect(text).toContain('Freelance Design Studio Inc');
  expect(text).toContain('Premium Consulting Service Description');

  // Assert the public notes are present
  expect(text).toContain('TERMS: Net 15 days. Public notes field is active.');

  // Assert the private internal_note string is ABSOLUTELY ABSENT
  expect(text).not.toContain('SECRET_NEGOTIATION_2026_DO_NOT_SHOW');
  expect(text).not.toContain('internal_note');
}, 30000);

test('sanitizeFilename correctly sanitizes slashes, quotes, and invalid characters', () => {
  const resultSlash = sanitizeFilename('Acme/Consulting');
  expect(resultSlash).toBe('Acme-Consulting');

  const resultQuote = sanitizeFilename('Clario "Software" LLC');
  expect(resultQuote).toBe('Clario-Software-LLC');

  // Comprehensive test for special characters
  const resultMix = sanitizeFilename('A/B\\C?D%E*F:G|H"I<J>K L');
  expect(resultMix).toBe('A-B-C-D-E-F-G-H-I-J-K-L');
});
