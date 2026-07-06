function parseIsoDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day, 12, 0, 0, 0);

  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null;
  }

  return date;
}

function formatIsoDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(date: Date, days: number) {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + days);
  return nextDate;
}

function easterSunday(year: number) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;

  return new Date(year, month - 1, day, 12, 0, 0, 0);
}

export function isPolishNonWorkingDay(date: Date) {
  const dayOfWeek = date.getDay();
  if (dayOfWeek === 0 || dayOfWeek === 6) return true;

  const year = date.getFullYear();
  const monthDay = `${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  const fixedHolidays = new Set([
    "01-01",
    "01-06",
    "05-01",
    "05-03",
    "08-15",
    "11-01",
    "11-11",
    "12-24",
    "12-25",
    "12-26",
  ]);
  if (fixedHolidays.has(monthDay)) return true;

  const easter = easterSunday(year);
  const movableHolidays = new Set([
    formatIsoDate(easter),
    formatIsoDate(addDays(easter, 1)),
    formatIsoDate(addDays(easter, 49)),
    formatIsoDate(addDays(easter, 60)),
  ]);

  return movableHolidays.has(formatIsoDate(date));
}

export function adjustToNextPolishBusinessDay(value: string | null | undefined): string | null {
  if (!value) return null;

  const date = parseIsoDate(value);
  if (!date) return value;

  let adjustedDate = date;
  while (isPolishNonWorkingDay(adjustedDate)) {
    adjustedDate = addDays(adjustedDate, 1);
  }

  return formatIsoDate(adjustedDate);
}
