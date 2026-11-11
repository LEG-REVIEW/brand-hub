// Photos sent through the Telegram bot are stored in Vercel Blob. A task keeps
// references to them in its "screenshotImageIds" column (comma-separated):
//   blob:p:<pathname>  -> private store, shown through /api/photo
//   blob:u:<url>       -> public store, shown directly
export const isBlobRef = (ref) => typeof ref === 'string' && ref.startsWith('blob:');

export function blobRefToUrl(ref) {
  if (ref.startsWith('blob:p:')) return `/api/photo?pathname=${encodeURIComponent(ref.slice(7))}`;
  if (ref.startsWith('blob:u:')) return ref.slice(7);
  return '';
}

// Task links can carry a display name. They are stored in the same
// comma-separated "links" column as "Name::https://url" (plain URLs, which
// every older task has, still work). Commas in a name would break the column
// split, so they are replaced with a space (colons are fine).
export function parseLink(entry) {
  const raw = String(entry || '');
  const m = raw.match(/^(.*?)::(https?:\/\/.*)$/i);
  if (m && m[1].trim()) return { name: m[1].trim(), url: m[2].trim() };
  return { name: '', url: raw.trim() };
}

export function formatLink(name, url) {
  // Only commas (column separator) and "::" (name/url separator) are unsafe in a name.
  const clean = String(name || '').replace(/,/g, ' ').replace(/::+/g, ':').replace(/\s+/g, ' ').trim();
  return clean ? `${clean}::${String(url).trim()}` : String(url).trim();
}
