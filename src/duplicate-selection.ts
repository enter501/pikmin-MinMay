export type DuplicateCandidate = {
  id: string;
  uploadedBy?: string;
  category?: string;
  createdAt?: string;
  coordinates?: {lat:number;lng:number};
  location: {
    countryName: string;
    city?: string;
    district?: string;
    landmark?: string;
  };
};

function distanceKm(a?:{lat:number;lng:number}, b?:{lat:number;lng:number}):number {
  if(!a || !b || ![a.lat,a.lng,b.lat,b.lng].every(Number.isFinite))return Number.POSITIVE_INFINITY;
  const radians=(degrees:number)=>degrees*Math.PI/180;
  const latDelta=radians(b.lat-a.lat);
  const lngDelta=radians(((b.lng-a.lng+540)%360)-180);
  const val=Math.sin(latDelta/2)**2+Math.cos(radians(a.lat))*Math.cos(radians(b.lat))*Math.sin(lngDelta/2)**2;
  return 6371*2*Math.asin(Math.sqrt(Math.min(1,Math.max(0,val))));
}

// Candidate search is independent of the current gallery page and its filters.
// The target itself must never be offered as its own duplicate.
export function duplicateCandidates<T extends DuplicateCandidate>(
  cards: T[], targetId: string, country: string, search: string
): T[] {
  const keyword = search.trim().toLocaleLowerCase('zh-TW');
  const target = cards.find(card=>card.id===targetId);
  return cards.filter(card => {
    if (card.id === targetId) return false;
    if (country !== '全部國家' && card.location.countryName !== country) return false;
    const searchable = [
      card.location.countryName,
      card.location.city,
      card.location.district,
      card.location.landmark,
      card.uploadedBy,
      card.category
    ].filter(Boolean).join(' ').toLocaleLowerCase('zh-TW');
    return searchable.includes(keyword);
  }).sort((a,b)=>{
    // Duplicates often refer to the same landmark. Bring nearby postcards to
    // the front, but keep every other card available through search/browsing.
    const delta=distanceKm(target?.coordinates,a.coordinates)-distanceKm(target?.coordinates,b.coordinates);
    if(!Number.isNaN(delta) && delta!==0)return delta;
    // Keep the current gallery order when coordinates are missing or equal.
    return 0;
  });
}

export function duplicateCountryOptions<T extends DuplicateCandidate>(cards: T[], targetId: string): {value: string; count: number}[] {
  const counts = new Map<string,number>();
  for(const card of cards) {
    if (card.id === targetId) continue;
    counts.set(card.location.countryName,(counts.get(card.location.countryName)??0)+1);
  }
  return [
    {value:'全部國家',count:cards.length - Number(cards.some(card=>card.id===targetId))},
    ...[...counts].sort(([a],[b])=>a.localeCompare(b,'zh-TW')).map(([value,count])=>({value,count}))
  ];
}
