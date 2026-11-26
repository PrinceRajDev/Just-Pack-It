export type OpeningInterval = { day: number; opens: string; closes: string };

const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
export const validTime = (value: string) => /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
const toMinutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));

export function shopHoursLabel({
  openingHours = [], timezone = "Asia/Kolkata", temporarilyClosed, isOpen,
}: {
  openingHours?: OpeningInterval[];
  timezone?: string;
  temporarilyClosed?: boolean;
  isOpen?: boolean;
}, now = new Date()) {
  if (temporarilyClosed) return "Temporarily closed";
  if (isOpen === true) return "Open now";
  if (!openingHours.length) return "Closed · No opening hours set";
  if (openingHours.some(({ opens, closes, day }) =>
    !validTime(opens) || !validTime(closes) || opens === closes || !days[day]))
    return "Enter valid opening and closing times to preview.";
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone, weekday: "long", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(now);
  const day = days.indexOf(parts.find(part => part.type === "weekday")!.value);
  const minute = Number(parts.find(part => part.type === "hour")!.value) * 60 +
    Number(parts.find(part => part.type === "minute")!.value);
  let next = { offset: Infinity, start: 0 };
  for (const interval of openingHours) {
    const start = toMinutes(interval.opens);
    const end = toMinutes(interval.closes);
    const offset = (interval.day - day + 7) % 7;
    if (isOpen === undefined && (
      (offset === 0 && minute >= start && (start > end || minute < end)) ||
      (offset === 6 && start > end && minute < end)
    )) return "Open now";
    const nextDay = offset === 0 && start <= minute ? 7 : offset;
    if (nextDay * 1440 + start < next.offset * 1440 + next.start) next = { offset: nextDay, start };
  }
  const when = next.offset === 0 ? "today" : next.offset === 1 ? "tomorrow"
    : next.offset === 7 ? `next ${days[day]}` : days[(day + next.offset) % 7];
  const hour = Math.floor(next.start / 60);
  const remainder = next.start % 60;
  return `Opens ${when} at ${hour % 12 || 12}${remainder ? `:${String(remainder).padStart(2, "0")}` : ""} ${hour < 12 ? "AM" : "PM"}`;
}
