import { InvoiceDetail, ClientDetail } from '../data/types';
import { ProfileRow } from '../sync/schema';

interface GeneratePDFParams {
  invoice: InvoiceDetail;
  profile: ProfileRow;
  client: ClientDetail;
}

/**
 * Sanitizes a string to make it safe for file systems.
 * Removes slashes, quotes, colons, and other invalid characters.
 */
export function sanitizeFilename(name: string): string {
  return name
    .replace(/[/\\?%*:|"<>\s]/g, '-') // replace invalid characters with hyphen
    .replace(/-+/g, '-')             // collapse duplicate hyphens
    .replace(/^-+|-+$/g, '');        // trim leading/trailing hyphens
}

/**
 * Dynamically lazy-loads @react-pdf/renderer and generates an invoice PDF.
 * Triggers a device share sheet on supported mobile environments, falling back to download.
 */
export async function generateInvoicePDF({ invoice, profile, client }: GeneratePDFParams): Promise<void> {
  // 1. Dynamic imports to avoid bundling libraries in the main chunk
  const { pdf } = await import('@react-pdf/renderer');
  const { InvoicePDFDocument } = await import('../../components/InvoicePDFDocument');

  // 2. Build sanitized filename
  const cleanInvoiceNum = sanitizeFilename(invoice.invoice_number);
  const cleanClientName = sanitizeFilename(client.name);
  const filename = `${cleanInvoiceNum}-${cleanClientName}.pdf`.toLowerCase();

  try {
    // 3. Generate raw blob using @react-pdf/renderer on-device
    const docInstance = InvoicePDFDocument({ invoice, profile, client });
    const blob = await pdf(docInstance).toBlob();

    if (!blob || blob.size === 0) {
      throw new Error('Generated PDF blob is empty');
    }

    // 4. Mobile share check
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
      typeof navigator !== 'undefined' ? navigator.userAgent : ''
    );

    if (isMobile && typeof navigator !== 'undefined' && navigator.share && navigator.canShare) {
      const file = new File([blob], filename, { type: 'application/pdf' });
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: `Invoice ${invoice.invoice_number}`,
          text: `Invoice ${invoice.invoice_number} from ${profile.business_name || 'Clario'}`
        });
        return; // Shared successfully
      }
    }

    // 5. Desktop/Standard anchor download fallback
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      console.log('Share action was cancelled by the user.');
      return;
    }
    console.error('PDF Generation Error:', error);
    throw new Error(
      error instanceof Error ? error.message : 'An error occurred while compiling the PDF document.'
    );
  }
}
