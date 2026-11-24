export interface LocalDateTime {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

const formatterCache = new Map<string, Intl.DateTimeFormat>();
const debugTime = process.env.DEBUG_TIME === '1';

function formatter(timezone: string): Intl.DateTimeFormat {
  let value = formatterCache.get(timezone);
  if (!value) {
    value = new Intl.DateTimeFormat('en-GB', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    });
    formatterCache.set(timezone, value);
  }
  return value;
}

export function assertTimeZone(timezone: string): void {
  try {
    formatter(timezone).format(new Date(0));
  } catch {
    throw new RangeError('timezone must be a valid IANA time zone');
  }
}

export function localDateTime(instant: Date, timezone: string): LocalDateTime {
  const parts = formatter(timezone).formatToParts(instant);
  const values = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );
  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour),
    minute: Number(values.minute),
    second: Number(values.second),
  };
}

function sameLocal(left: LocalDateTime, right: LocalDateTime): boolean {
  return left.year === right.year &&
    left.month === right.month &&
    left.day === right.day &&
    left.hour === right.hour &&
    left.minute === right.minute &&
    left.second === right.second;
}

function localAsUtc(value: LocalDateTime): number {
  return Date.UTC(
    value.year,
    value.month - 1,
    value.day,
    value.hour,
    value.minute,
    value.second,
  );
}

/**
 * Turn the clinic's local clock time into one exact moment in time.
 * Daylight-saving changes can make a local time disappear or happen twice:
 *
 * - When Madrid's clocks jump forward on 28 March 2027, they skip from 02:00
 *   to 03:00. A requested 02:30 never appears on the clock, so this method
 *   moves it forward by the one-hour gap to 03:30 (01:30 UTC).
 * - When Madrid's clocks move back on 31 October 2027, 02:30 happens twice.
 *   This method chooses the earlier one: 02:30 while Madrid is still on UTC+2
 *   (00:30 UTC), rather than the second 02:30 after the change (01:30 UTC).
 *
 * This follows the common "compatible" rule: move missing times forward and
 * use the earlier moment when a time occurs twice.
 */
export function localDateTimeToInstant(
  value: LocalDateTime,
  timezone: string,
): Date {
  const target = localAsUtc(value);
  const offsets = new Set<number>();
  for (let hours = -36; hours <= 36; hours += 3) {
    const probe = new Date(target + hours * 60 * 60 * 1000);
    const wall = localDateTime(probe, timezone);
    const offset = localAsUtc(wall) - probe.getTime();
    offsets.add(offset);
    if (debugTime) {
      console.debug('[time] probe', {
        probe: probe.toISOString(),
        wall,
        offsetHours: offset / (60 * 60 * 1000),
        offsetsHours: [...offsets].map((value) => value / (60 * 60 * 1000)),
      });
    }
  }

  const candidates = [...offsets].map((offset) => target - offset);
  if (debugTime) {
    console.debug('[time] candidates', {
      candidates,
      localTimes: candidates.map((candidate) => {
        const local = formatAppointmentLocal(new Date(candidate), timezone);
        return {
          instant: new Date(candidate).toISOString(),
          wall: `${local.date} ${local.time} (${timezone})`,
        };
      }),
    });
  }
  /*
   * `exact` is the list of candidate moments that convert back to exactly the
   * local date and time requested.
   *
   * For each candidate, the code asks, “What time would the clinic’s clock
   * show at this moment?” `sameLocal(...)` compares that answer with the
   * requested year, month, day, hour, minute, and second.
   *
   * - On an ordinary day, `exact` contains the matching moment.
   * - When the clock moves back in autumn, it can contain two matching
   *   moments; the next line chooses the earlier one.
   * - When the clock jumps forward over the requested time, `exact` is empty.
   *   The method then uses the “first valid time after it” logic.
   */
  const exact = candidates.filter((candidate) =>
    sameLocal(localDateTime(new Date(candidate), timezone), value),
  );
  if (debugTime) {
    console.debug('[time] exact matches', exact);
  }
  if (exact.length) return new Date(Math.min(...exact));

  const after = candidates
    .map((candidate) => ({
      candidate,
      wall: localAsUtc(localDateTime(new Date(candidate), timezone)),
    }))
    .filter(({ wall }) => wall > target)
    .sort(
      (left, right) =>
        left.wall - right.wall || left.candidate - right.candidate,
    );
  if (after.length) {
    return new Date(after[0]!.candidate);
  }
  throw new RangeError('local date and time cannot be resolved in timezone');
}

function shiftCalendarDate(value: LocalDateTime, days: number): LocalDateTime {
  const shifted = new Date(
    Date.UTC(value.year, value.month - 1, value.day + days),
  );
  return {
    ...value,
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  };
}

export function reminderTimeBefore(
  appointmentStart: Date,
  timezone: string,
): Date {
  const appointmentLocal = localDateTime(appointmentStart, timezone);
  const previousDay = shiftCalendarDate(appointmentLocal, -1);
  return localDateTimeToInstant(previousDay, timezone);
}

export function applyInitialQuietHours(instant: Date, timezone: string): Date {
  const local = localDateTime(instant, timezone);
  if (local.hour >= 9 && local.hour < 21) return instant;
  const date = local.hour < 9 ? local : shiftCalendarDate(local, 1);
  return localDateTimeToInstant(
    { ...date, hour: 9, minute: 0, second: 0 },
    timezone,
  );
}

export function formatAppointmentLocal(
  instant: Date,
  timezone: string,
): { date: string; time: string } {
  const local = localDateTime(instant, timezone);
  const date =
    `${String(local.day).padStart(2, '0')}/` +
    `${String(local.month).padStart(2, '0')}/${local.year}`;
  const time =
    `${String(local.hour).padStart(2, '0')}:` +
    `${String(local.minute).padStart(2, '0')}`;
  return { date, time };
}
