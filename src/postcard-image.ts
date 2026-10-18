/** Public postcards retain relative paths in postcards.json, regardless of image storage. */
export type PostcardImage = {imageUrl: string; imageStorage?: string};

const R2_IMAGE_ORIGIN = 'https://minmay-upload.retne501-minmay.workers.dev';
const postcardPath = /^images\/postcards\/[A-Za-z0-9_-]+\.(?:webp|jpg|jpeg|png)$/;

export function postcardImageUrl(card: PostcardImage, pagesBaseUrl: string): string {
  const path = card.imageUrl.replace(/^\//, '').replace(/^public\//, '');
  if (card.imageStorage === 'r2') {
    // R2 is accessible only through our fixed Worker endpoint; never trust
    // arbitrary hosts, query strings, or path traversal in postcard records.
    return postcardPath.test(path) ? `${R2_IMAGE_ORIGIN}/${path}` : '';
  }
  // Records with no imageStorage are the existing GitHub Pages collection.
  return `${pagesBaseUrl}${path}`;
}
