import { Schema, Table, column } from '@powersync/web';

// Define the local SQLite schema using object keys for table names
export const AppSchema = new Schema({
  profiles: new Table({
    business_name: column.text,
    business_address: column.text,
    default_currency: column.text,
    created_at: column.text,
    updated_at: column.text
  }),
  clients: new Table(
    {
      user_id: column.text,
      name: column.text,
      email: column.text,
      phone: column.text,
      company: column.text,
      notes: column.text,
      default_currency: column.text,
      created_at: column.text,
      updated_at: column.text,
      deleted_at: column.text
    },
    {
      indexes: {
        user_id: ['user_id'],
        deleted_at: ['deleted_at'],
        created_at: ['created_at'],
        user_deleted: ['user_id', 'deleted_at']
      }
    }
  ),
  client_links: new Table(
    {
      user_id: column.text,
      client_id: column.text,
      label: column.text,
      url: column.text,
      created_at: column.text,
      updated_at: column.text,
      deleted_at: column.text
    },
    {
      indexes: {
        client_id: ['client_id'],
        user_id: ['user_id'],
        deleted_at: ['deleted_at'],
        client_deleted: ['client_id', 'deleted_at']
      }
    }
  ),
  invoices: new Table(
    {
      user_id: column.text,
      client_id: column.text,
      invoice_number: column.text,
      status: column.text,
      currency: column.text,
      total_minor: column.integer,
      issue_date: column.text,
      due_date: column.text,
      notes: column.text,
      internal_note: column.text,
      created_at: column.text,
      updated_at: column.text,
      deleted_at: column.text
    },
    {
      indexes: {
        client_id: ['client_id'],
        user_id: ['user_id'],
        status: ['status'],
        deleted_at: ['deleted_at'],
        due_date: ['due_date'],
        created_at: ['created_at'],
        client_deleted: ['client_id', 'deleted_at'],
        status_deleted: ['status', 'deleted_at']
      }
    }
  ),
  invoice_line_items: new Table(
    {
      user_id: column.text,
      invoice_id: column.text,
      description: column.text,
      quantity: column.real,
      unit_price_minor: column.integer,
      line_total_minor: column.integer,
      position: column.integer,
      created_at: column.text,
      updated_at: column.text,
      deleted_at: column.text
    },
    {
      indexes: {
        invoice_id: ['invoice_id'],
        user_id: ['user_id'],
        deleted_at: ['deleted_at'],
        invoice_deleted: ['invoice_id', 'deleted_at'],
        position: ['position']
      }
    }
  ),
  payment_events: new Table(
    {
      user_id: column.text,
      invoice_id: column.text,
      client_id: column.text,
      amount_minor: column.integer,
      currency: column.text,
      method: column.text,
      note: column.text,
      occurred_at: column.text,
      reverses_id: column.text,
      created_at: column.text
    },
    {
      indexes: {
        invoice_id: ['invoice_id'],
        client_id: ['client_id'],
        user_id: ['user_id'],
        occurred_at: ['occurred_at'],
        reverses_id: ['reverses_id'],
        created_at: ['created_at'],
        invoice_occurred: ['invoice_id', 'occurred_at'],
        client_occurred: ['client_id', 'occurred_at']
      }
    }
  )
});

// Row types exported for local database queries and repository mappings
export interface ProfileRow {
  id: string; // PowerSync automatically maps primary key as id
  business_name?: string | null;
  business_address?: string | null;
  default_currency: string;
  created_at: string;
  updated_at: string;
}

export interface ClientRow {
  id: string;
  user_id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  company?: string | null;
  notes?: string | null;
  default_currency?: string | null;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
}

export interface ClientLinkRow {
  id: string;
  user_id: string;
  client_id: string;
  label: string;
  url: string;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
}

export interface InvoiceRow {
  id: string;
  user_id: string;
  client_id: string;
  invoice_number: string;
  status: 'draft' | 'sent' | 'void';
  currency: string;
  total_minor: number;
  issue_date?: string | null;
  due_date?: string | null;
  notes?: string | null;
  internal_note?: string | null;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
}

export interface InvoiceLineItemRow {
  id: string;
  user_id: string;
  invoice_id: string;
  description: string;
  quantity: number;
  unit_price_minor: number;
  line_total_minor: number;
  position: number;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
}

export interface PaymentEventRow {
  id: string;
  user_id: string;
  invoice_id: string;
  client_id: string;
  amount_minor: number;
  currency: string;
  method?: string | null;
  note?: string | null;
  occurred_at: string;
  reverses_id?: string | null;
  created_at: string;
}
