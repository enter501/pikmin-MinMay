import {formatTaiwanOffset, taiwanOffsetMinutes} from './timezone.ts';

type CountryPostcard = {
  location: {countryName: string};
  coordinates: {lat: number; lng: number};
};

export type CountryOption = {value: string; label: string; sortMinutes: number | null; count: number};

// Country names are filter values. Actual available postcard coordinates are
// used for DST-aware offsets; multi-time-zone countries show the observed range.
export function countryOptions(cards: CountryPostcard[], now: Date): CountryOption[] {
  const offsets = new Map<string, Set<number>>();
  const counts = new Map<string, number>();
  for (const card of cards) {
    const name = card.location?.countryName;
    if (!name) continue;
    if (!offsets.has(name)) offsets.set(name, new Set());
    counts.set(name, (counts.get(name) ?? 0) + 1);
    const minutes = taiwanOffsetMinutes(card.coordinates?.lat, card.coordinates?.lng, now);
    if (minutes !== null) offsets.get(name)!.add(minutes);
  }
  const options: CountryOption[] = [...offsets].map(([value, minutes]) => {
    const ordered = [...minutes].sort((a, b) => a - b);
    const sortMinutes = ordered.length ? ordered[0] : null;
    const difference = !ordered.length ? '時差未知'
      : ordered.length === 1 ? formatTaiwanOffset(ordered[0])
      : `${formatTaiwanOffset(ordered[0])}～${formatTaiwanOffset(ordered[ordered.length - 1])}`;
    const count = counts.get(value)!;
    return {value, label: `${value}（${difference}）（${count} 張）`, sortMinutes, count};
  });
  options.sort((a, b) => {
    if (a.sortMinutes === null) return b.sortMinutes === null ? a.value.localeCompare(b.value, 'zh-TW') : 1;
    if (b.sortMinutes === null) return -1;
    return a.sortMinutes - b.sortMinutes || a.value.localeCompare(b.value, 'zh-TW');
  });
  return [{value: '全部國家', label: `全部國家（${cards.length} 張）`, sortMinutes: null, count: cards.length}, ...options];
}
