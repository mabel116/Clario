import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '../../../lib/supabase';

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const next = requestUrl.searchParams.get('next') || '/';

  if (code) {
    try {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) {
        console.error('OAuth exchange error:', error);
        return NextResponse.redirect(`${requestUrl.origin}/sign-in?error=${encodeURIComponent(error.message)}`);
      }
    } catch (err: any) {
      console.error('OAuth callback server error:', err);
      return NextResponse.redirect(`${requestUrl.origin}/sign-in?error=OAuth+callback+failed`);
    }
  }

  // URL to redirect to after successful exchange
  return NextResponse.redirect(`${requestUrl.origin}${next}`);
}
