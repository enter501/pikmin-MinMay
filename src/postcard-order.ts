import type {CountryOption} from './country-options.ts';

type SortableCard = {
  id: string;
  createdAt?: string;
  uploadedAt?: string;
  externalSource?: {site: string; postcardId: string};
  location: {countryName: string};
};

// Cards created through a user's invitation have no externalSource metadata.
// Public display names (including 白鹿) are NOT a proof of ownership.
export function isImported(card: SortableCard): boolean {
  return Boolean(card.externalSource?.site);
}

function dateOf(card: SortableCard): number {
  const date = isImported(card) ? card.createdAt : (card.uploadedAt || card.createdAt);
  const time = date ? Date.parse(date) : Number.NaN;
  return Number.isFinite(time) ? time : Number.NEGATIVE_INFINITY;
}

/**
 * With 全部國家 selected, show invitation uploads from ALL countries first,
 * newest-first, followed by shared imports, newest-first.
 * With a country selected, keep its original per-country ordering.
 * Do not mutate the canonical index; pagination happens after this sort.
 */
export function sortPostcards<T extends SortableCard>(
  cards: T[], countries: CountryOption[], selectedCountry = ''
): T[] {
  const countryRank = new Map(countries.map((value, index) => [value.value, index]));
  return [...cards].sort((a, b) => {
    if (selectedCountry !== '全部國家') {
      const rankA = countryRank.get(a.location.countryName) ?? Number.MAX_SAFE_INTEGER;
      const rankB = countryRank.get(b.location.countryName) ?? Number.MAX_SAFE_INTEGER;
      if (rankA !== rankB) return rankA - rankB;
      if (a.location.countryName !== b.location.countryName) {
        return a.location.countryName.localeCompare(b.location.countryName, 'zh-TW');
      }
    }
    const aImported = isImported(a) ? 1 : 0;
    const bImported = isImported(b) ? 1 : 0;
    if (aImported !== bImported) return aImported - bImported;
    return dateOf(b) - dateOf(a) || a.id.localeCompare(b.id);
  });
}
