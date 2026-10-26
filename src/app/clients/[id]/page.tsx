import { redirect } from 'next/navigation';

export function generateStaticParams() {
  return [{ id: '_shell_' }];
}

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function ClientDetailCanonicalRedirect({ params }: PageProps) {
  const { id } = await params;
  redirect(`/clients?id=${encodeURIComponent(id)}`);
}

