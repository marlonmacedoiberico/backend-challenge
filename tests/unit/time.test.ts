import assert from 'node:assert/strict';
import test from 'node:test';
import {
  localDateTime,
  localDateTimeToInstant,
} from '../../src/domain/time.js';

// On this Sunday, Madrid jumps straight from 02:00 to 03:00, so 02:30 never
// appears on the clock. localDateTimeToInstant handles that missing time by
// moving forward by the one-hour gap: the result is 03:30 in Madrid (01:30 UTC).
test('localDateTimeToInstant shifts a nonexistent spring-forward time by the DST gap', () => {
  const instant = localDateTimeToInstant(
    { year: 2027, month: 3, day: 28, hour: 2, minute: 30, second: 0 },
    'Europe/Madrid',
  );

  assert.equal(instant.toISOString(), '2027-03-28T01:30:00.000Z');
  assert.deepEqual(localDateTime(instant, 'Europe/Madrid'), {
    year: 2027,
    month: 3,
    day: 28,
    hour: 3,
    minute: 30,
    second: 0,
  });
});
