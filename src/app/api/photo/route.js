import { NextResponse } from 'next/server';
import { get } from '@vercel/blob';

// Streams a photo from the private Blob store (see lib/attachments.js).
// Only paths created by the Telegram bot (telegram/...) can be read.
export const dynamic = 'force-dynamic';

export async function GET(request) {
  const pathname = request.nextUrl.searchParams.get('pathname') || '';
  if (!pathname.startsWith('telegram/') || pathname.includes('..')) {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }
  try {
    const result = await get(pathname, { access: 'private' });
    if (!result || result.statusCode !== 200) return new NextResponse('Not found', { status: 404 });
    return new NextResponse(result.stream, {
      headers: {
        'Content-Type': result.blob.contentType,
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'private, max-age=86400',
      },
    });
  } catch (err) {
    console.error('GET /api/photo error:', err);
    return new NextResponse('Failed', { status: 500 });
  }
}
