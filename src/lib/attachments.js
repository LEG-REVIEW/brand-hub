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
