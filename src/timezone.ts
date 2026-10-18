import tzLookup from 'tz-lookup';

// Difference from Taiwan at the moment the gallery is viewed (DST-aware).
const taiwanTimeZone = 'Asia/Taipei';
const formatterCache = new Map<string, Intl.DateTimeFormat>();
function offsetMinutes(timeZone: string, instant: Date): number {
  let formatter = formatterCache.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone, timeZoneName: 'longOffset', hour: 'numeric', hourCycle: 'h23'
    });
    formatterCache.set(timeZone, formatter);
  }
  const value = formatter.formatToParts(instant).find(part => part.type === 'timeZoneName')?.value;
  if (!value || value === 'GMT') return 0;
  const match = /^GMT([+-])(\d{2}):(\d{2})$/.exec(value);
  if (!match) throw new Error('Unknown UTC offset');
  return (match[1] === '-' ? -1 : 1) * (Number(match[2]) * 60 + Number(match[3]));
}
export function taiwanOffsetMinutes(lat: number, lng: number, instant: Date = new Date()): number | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  try {
    const timeZone = tzLookup(lat, lng);
    const minutes = offsetMinutes(timeZone, instant) - offsetMinutes(taiwanTimeZone, instant);
    return Number.isFinite(minutes) ? minutes : null;
  } catch { return null; }
}

export function formatTaiwanOffset(minutes: number): string {
  const hours = Math.abs(minutes) / 60;
  const value = Number.isInteger(hours) ? String(hours) : hours.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
  return (minutes < 0 ? '−' : minutes > 0 ? '+' : '') + value;
}

export function taiwanTimeDifference(lat: number, lng: number, instant: Date = new Date()): string | null {
  const minutes = taiwanOffsetMinutes(lat, lng, instant);
  return minutes === null ? null : formatTaiwanOffset(minutes);
}
