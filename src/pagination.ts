export const POSTCARDS_PER_PAGE = 24;

export type PageMark = number | 'ellipsis';

export function paginate<T>(items: T[], requestedPage: number, pageSize = POSTCARDS_PER_PAGE) {
  if (!Number.isSafeInteger(pageSize) || pageSize < 1) throw new Error('Invalid page size');
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const page = Number.isSafeInteger(requestedPage)
    ? Math.max(1, Math.min(requestedPage, totalPages)) : 1;
  const start = (page - 1) * pageSize;
  return {
    page,
    totalPages,
    items: items.slice(start, start + pageSize),
    from: items.length ? start + 1 : 0,
    to: Math.min(start + pageSize, items.length),
    total: items.length
  };
}

export function paginationMarks(current: number, totalPages: number): PageMark[] {
  if (totalPages <= 7) return Array.from({length: totalPages}, (_, i) => i + 1);
  const pages = new Set([1, totalPages]);
  for (let n = Math.max(2, current - 1); n <= Math.min(totalPages - 1, current + 1); n++) pages.add(n);
  // Avoid ellipses in place of a single missing page.
  if (current <= 4) for (let n = 2; n <= 5; n++) pages.add(n);
  if (current >= totalPages - 3) for (let n = totalPages - 4; n < totalPages; n++) pages.add(n);
  const sorted = [...pages].sort((a, b) => a - b);
  const output: PageMark[] = [];
  for (const n of sorted) {
    const previous = output[output.length - 1];
    if (typeof previous === 'number' && n - previous > 1) {
      if (n - previous === 2) output.push(previous + 1);
      else output.push('ellipsis');
    }
    output.push(n);
  }
  return output;
}
