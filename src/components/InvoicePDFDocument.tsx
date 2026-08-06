import React from 'react';
import { Document, Page, Text, View, StyleSheet, Font } from '@react-pdf/renderer';
import { InvoiceDetail, ClientDetail } from '../lib/data/types';
import { ProfileRow } from '../lib/sync/schema';
import { formatMoney } from '../lib/money';
import { INTER_REGULAR_B64, INTER_BOLD_B64 } from './fonts';

// Register embedded Inter Fonts for network-independent offline PDF generation
Font.register({
  family: 'Inter',
  fonts: [
    { src: INTER_REGULAR_B64, fontWeight: 400 },
    { src: INTER_BOLD_B64, fontWeight: 700 }
  ]
});

const styles = StyleSheet.create({
  page: {
    padding: 40,
    fontSize: 9,
    fontFamily: 'Inter',
    color: '#1e293b',
    backgroundColor: '#ffffff',
    display: 'flex',
    flexDirection: 'column'
  },
  headerContainer: {
    display: 'flex',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    paddingBottom: 20,
    marginBottom: 20
  },
  businessDetails: {
    maxWidth: '60%'
  },
  businessName: {
    fontSize: 14,
    fontWeight: 700,
    color: '#0f172a',
    marginBottom: 4
  },
  businessAddress: {
    fontSize: 8,
    color: '#64748b',
    lineHeight: 1.4
  },
  invoiceMeta: {
    alignItems: 'flex-end',
    textAlign: 'right'
  },
  invoiceTitle: {
    fontSize: 16,
    fontWeight: 700,
    color: '#4f46e5',
    textTransform: 'uppercase',
    letterSpacing: 1
  },
  invoiceNumber: {
    fontSize: 10,
    fontWeight: 700,
    color: '#0f172a',
    fontFamily: 'Courier', // monospace look for document IDs
    marginTop: 2,
    marginBottom: 6
  },
  timelineText: {
    fontSize: 8,
    color: '#64748b',
    lineHeight: 1.4
  },
  billingContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 25
  },
  billingBlock: {
    width: '45%'
  },
  sectionTitle: {
    fontSize: 8,
    fontWeight: 700,
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6
  },
  clientName: {
    fontSize: 10,
    fontWeight: 700,
    color: '#0f172a',
    marginBottom: 2
  },
  clientText: {
    fontSize: 8,
    color: '#475569',
    lineHeight: 1.4
  },
  // Table layout styles with pagination repeat header support
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#f8fafc',
    borderBottomWidth: 1,
    borderBottomColor: '#cbd5e1',
    paddingVertical: 6,
    paddingHorizontal: 8,
    alignItems: 'center'
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    paddingVertical: 8,
    paddingHorizontal: 8,
    alignItems: 'center'
  },
  colDesc: {
    flex: 1,
    paddingRight: 10
  },
  colQty: {
    width: 60,
    textAlign: 'center'
  },
  colPrice: {
    width: 80,
    textAlign: 'right'
  },
  colTotal: {
    width: 80,
    textAlign: 'right'
  },
  headerText: {
    fontSize: 7,
    fontWeight: 700,
    color: '#475569',
    textTransform: 'uppercase'
  },
  cellText: {
    fontSize: 8,
    color: '#334155',
    lineHeight: 1.3
  },
  cellTextBold: {
    fontSize: 8,
    fontWeight: 700,
    color: '#0f172a'
  },
  // Summary block
  summaryContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginTop: 20,
    marginBottom: 30
  },
  notesBlock: {
    width: '55%',
    backgroundColor: '#f8fafc',
    padding: 10,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#f1f5f9'
  },
  notesText: {
    fontSize: 7.5,
    color: '#475569',
    lineHeight: 1.4
  },
  totalsBlock: {
    width: '35%',
    alignItems: 'flex-end'
  },
  totalsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9'
  },
  totalsRowFinal: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    paddingVertical: 6,
    marginTop: 2,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0'
  },
  totalsLabel: {
    fontSize: 8,
    color: '#64748b',
    fontWeight: 700
  },
  totalsValue: {
    fontSize: 9,
    fontWeight: 700,
    color: '#0f172a'
  },
  balanceDueValue: {
    fontSize: 11,
    fontWeight: 700,
    color: '#4f46e5'
  },
  paidBadge: {
    marginTop: 10,
    paddingVertical: 4,
    paddingHorizontal: 8,
    backgroundColor: '#ecfdf5',
    borderWidth: 1,
    borderColor: '#a7f3d0',
    borderRadius: 4,
    alignSelf: 'flex-end'
  },
  paidBadgeText: {
    fontSize: 8,
    fontWeight: 700,
    color: '#059669',
    textTransform: 'uppercase',
    letterSpacing: 0.5
  },
  // Footer and page number styling
  footerContainer: {
    position: 'absolute',
    bottom: 25,
    left: 40,
    right: 40,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
    paddingTop: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  footerText: {
    fontSize: 7,
    color: '#94a3b8'
  }
});

interface InvoicePDFDocumentProps {
  invoice: InvoiceDetail;
  profile: ProfileRow;
  client: ClientDetail;
}

export function InvoicePDFDocument({ invoice, profile, client }: InvoicePDFDocumentProps) {
  const isSettled = invoice.balanceDueMinor <= 0;
  
  return (
    <Document title={`Invoice-${invoice.invoice_number}`} author={profile.business_name || 'Clario'}>
      <Page size="A4" style={styles.page}>
        
        {/* Header Block */}
        <View style={styles.headerContainer}>
          <View style={styles.businessDetails}>
            <Text style={styles.businessName}>{profile.business_name || 'Clario Freelancer'}</Text>
            {profile.business_address ? (
              <Text style={styles.businessAddress}>{profile.business_address}</Text>
            ) : null}
          </View>

          <View style={styles.invoiceMeta}>
            <Text style={styles.invoiceTitle}>Invoice</Text>
            <Text style={styles.invoiceNumber}>#{invoice.invoice_number}</Text>
            <Text style={styles.timelineText}>Issued: {invoice.issue_date || 'Draft'}</Text>
            <Text style={styles.timelineText}>Due: {invoice.due_date || 'On Receipt'}</Text>
          </View>
        </View>

        {/* Billing Information */}
        <View style={styles.billingContainer}>
          <View style={styles.billingBlock}>
            <Text style={styles.sectionTitle}>Billed To</Text>
            <Text style={styles.clientName}>{client.name}</Text>
            {client.company ? (
              <Text style={styles.clientText}>{client.company}</Text>
            ) : null}
            {client.email ? (
              <Text style={styles.clientText}>{client.email}</Text>
            ) : null}
            {client.phone ? (
              <Text style={styles.clientText}>{client.phone}</Text>
            ) : null}
          </View>

          <View style={styles.billingBlock}>
            {/* Monospace alignment anchor or secondary detail placeholder */}
          </View>
        </View>

        {/* Table Header - repeated on new pages */}
        <View style={styles.tableHeader} fixed>
          <View style={styles.colDesc}>
            <Text style={styles.headerText}>Description</Text>
          </View>
          <View style={styles.colQty}>
            <Text style={styles.headerText}>Qty</Text>
          </View>
          <View style={styles.colPrice}>
            <Text style={styles.headerText}>Unit Price</Text>
          </View>
          <View style={styles.colTotal}>
            <Text style={styles.headerText}>Total</Text>
          </View>
        </View>

        {/* Table Rows */}
        <View>
          {invoice.lineItems && invoice.lineItems.map((item) => (
            <View key={item.id} style={styles.tableRow} wrap={false}>
              <View style={styles.colDesc}>
                <Text style={styles.cellText}>{item.description}</Text>
              </View>
              <View style={styles.colQty}>
                <Text style={[styles.cellText, { textAlign: 'center' }]}>{item.quantity}</Text>
              </View>
              <View style={styles.colPrice}>
                <Text style={styles.cellText}>
                  {formatMoney({ amountMinor: item.unit_price_minor, currency: invoice.currency })}
                </Text>
              </View>
              <View style={styles.colTotal}>
                <Text style={[styles.cellText, { textAlign: 'right', fontWeight: 700 }]}>
                  {formatMoney({ amountMinor: item.line_total_minor, currency: invoice.currency })}
                </Text>
              </View>
            </View>
          ))}
        </View>

        {/* Summary Details */}
        <View style={styles.summaryContainer} wrap={false}>
          {/* Notes Card */}
          <View style={styles.notesBlock}>
            <Text style={styles.sectionTitle}>Terms & Public Notes</Text>
            <Text style={styles.notesText}>{invoice.notes || 'Payment terms apply.'}</Text>
          </View>

          {/* Totals Calculation */}
          <View style={styles.totalsBlock}>
            <View style={styles.totalsRow}>
              <Text style={styles.totalsLabel}>Subtotal</Text>
              <Text style={styles.totalsValue}>
                {formatMoney({ amountMinor: invoice.total_minor, currency: invoice.currency })}
              </Text>
            </View>

            {invoice.amountPaidMinor > 0 && (
              <View style={styles.totalsRow}>
                <Text style={styles.totalsLabel}>Paid to Date</Text>
                <Text style={styles.totalsValue}>
                  {formatMoney({ amountMinor: invoice.amountPaidMinor, currency: invoice.currency })}
                </Text>
              </View>
            )}

            <View style={styles.totalsRowFinal}>
              <Text style={styles.totalsLabel}>Balance Due</Text>
              <Text style={styles.balanceDueValue}>
                {formatMoney({ amountMinor: invoice.balanceDueMinor, currency: invoice.currency })}
              </Text>
            </View>

            {/* PAID badge Stamp */}
            {isSettled && (
              <View style={styles.paidBadge}>
                <Text style={styles.paidBadgeText}>Paid</Text>
              </View>
            )}
          </View>
        </View>

        {/* Footer Page Numbers */}
        <View style={styles.footerContainer} fixed>
          <Text style={styles.footerText}>Thank you for your business.</Text>
          <Text 
            style={styles.footerText} 
            render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} 
          />
        </View>

      </Page>
    </Document>
  );
}
