'use strict';

// Node.js translation of clips-code.md using the `durable` package.
// Install with: npm install durable
//
// The caller posts normalized event facts and consumes the asserted
// `effect` facts to persist changes or call the message provider. Keeping
// side effects outside rule actions makes provider calls retryable.
//
// Time model deliberately matches the CLIPS source: integer minutes on a
// fixed local-calendar timeline, with 1 day = 1440 minutes. This does not
// model DST transitions; use Temporal/Luxon and an IANA clinic timezone if
// the production requirement needs correct DST behavior.

const d = require('durable');

const DAY = 1440;
const QUIET_START = 21 * 60;
const QUIET_END = 9 * 60;

function isQuiet(minute) {
  const minuteOfDay = ((minute % DAY) + DAY) % DAY;
  return minuteOfDay < QUIET_END || minuteOfDay >= QUIET_START;
}

function nextAllowed(minute) {
  const minuteOfDay = ((minute % DAY) + DAY) % DAY;
  if (minuteOfDay < QUIET_END) return minute + QUIET_END - minuteOfDay;
  if (minuteOfDay >= QUIET_START) return minute + DAY - minuteOfDay + QUIET_END;
  return minute;
}

function sendTime(start, now) {
  return nextAllowed(Math.max(start - DAY, now));
}

function message(patientName, clinicName, date, time) {
  return `Hola ${patientName}, te recordamos tu cita en ${clinicName} el ${date} a las ${time}. Responde SI para confirmar o NO para cancelar.`;
}

d.ruleset('clinic_reminders', function () {
  // R8: Rescheduling invalidates active reminders, increments the version,
  // resets confirmation, and asks the caller to schedule the new version.
  whenAll: m.type == 'reschedule' && m.appointment.status != 'cancelled'
  run: assert({
    type: 'effect', effect: 'rescheduled', appointmentId: m.appointment.id,
    start: m.newStart, dateText: m.newDateText, timeText: m.newTimeText,
    version: m.appointment.version + 1, status: 'scheduled',
    cancelStatuses: ['pending', 'retry', 'sending'], reason: 'rescheduled',
    scheduleNext: true
  })

  // R9: Cancellation leaves sent reminders as history and cancels active ones.
  whenAll: m.type == 'cancel' && m.appointment.status != 'cancelled'
  run: assert({
    type: 'effect', effect: 'appointment-cancelled', appointmentId: m.appointment.id,
    status: 'cancelled', cancelStatuses: ['pending', 'retry', 'sending'],
    reason: 'appointment_cancelled'
  })

  // R1-R4: Create one reminder for the appointment's current version.
  // The producer sets hasCurrentVersionReminder from its persisted reminder list.
  whenAll: m.type == 'schedule' && m.appointment.status != 'cancelled' && m.hasCurrentVersionReminder == false
  run: assert({
    type: 'effect', effect: 'reminder-created', appointmentId: m.appointment.id,
    version: m.appointment.version, id: m.nextReminderId,
    sendAt: sendTime(m.appointment.start, m.now), status: 'pending',
    nextReminderId: m.nextReminderId + 1
  })

  // R1: Discard duplicate/obsolete schedule requests.
  whenAll: m.type == 'schedule' && m.hasCurrentVersionReminder == true
  run: assert({ type: 'effect', effect: 'schedule-request-discarded', appointmentId: m.appointment.id })

  // R5: Do not send reminders that are at/after appointment start or after it began.
  whenAll: m.type == 'evaluate-reminder' && (m.reminder.status == 'pending' || m.reminder.status == 'retry') && (m.reminder.sendAt >= m.appointment.start || m.now >= m.appointment.start)
  run: assert({
    type: 'effect', effect: 'reminder-updated', reminderId: m.reminder.id,
    status: 'skipped', reason: 'too_late'
  })

  // R6: Eligibility is checked only when the reminder is due.
  whenAll: m.type == 'evaluate-reminder' && (m.reminder.status == 'pending' || m.reminder.status == 'retry') && m.reminder.sendAt < m.appointment.start && m.now < m.appointment.start && m.reminder.sendAt <= m.now && m.quietHours == false && m.patient.phone == 'none'
  run: assert({ type: 'effect', effect: 'reminder-updated', reminderId: m.reminder.id, status: 'skipped', reason: 'no_phone' })

  whenAll: m.type == 'evaluate-reminder' && (m.reminder.status == 'pending' || m.reminder.status == 'retry') && m.reminder.sendAt < m.appointment.start && m.now < m.appointment.start && m.reminder.sendAt <= m.now && m.quietHours == false && m.patient.phone != 'none' && m.patient.acceptsReminders == false
  run: assert({ type: 'effect', effect: 'reminder-updated', reminderId: m.reminder.id, status: 'skipped', reason: 'opted_out' })

  // R3: Defer a due reminder through quiet hours, including retries.
  whenAll: m.type == 'evaluate-reminder' && (m.reminder.status == 'pending' || m.reminder.status == 'retry') && m.reminder.sendAt <= m.now && m.quietHours == true
  run: assert({
    type: 'effect', effect: 'reminder-updated', reminderId: m.reminder.id,
    sendAt: nextAllowed(m.now)
  })

  // R3/R5/R6/R7: Produce a provider request only for a due, eligible,
  // current-version reminder outside quiet hours and before the appointment.
  whenAll: m.type == 'evaluate-reminder' && (m.reminder.status == 'pending' || m.reminder.status == 'retry') && m.reminder.sendAt < m.appointment.start && m.now < m.appointment.start && m.reminder.sendAt <= m.now && m.appointment.status != 'cancelled' && m.reminder.version == m.appointment.version && m.patient.phone != 'none' && m.patient.acceptsReminders == true && m.quietHours == false && m.sendRequestExists == false
  run: assert({
    type: 'effect', effect: 'send-request-created', reminderId: m.reminder.id,
    phone: m.patient.phone, status: 'sending', attempts: m.reminder.attempts + 1,
    message: message(m.patient.name, m.clinic.name, m.appointment.dateText, m.appointment.timeText)
  })

  // R5: Provider outcomes update status and remove the outstanding request.
  whenAll: m.type == 'delivery-result' && m.outcome == 'success'
  run: assert({ type: 'effect', effect: 'delivery-completed', reminderId: m.reminderId, status: 'sent', removeSendRequest: true })

  whenAll: m.type == 'delivery-result' && m.outcome == 'failure'
  run: assert({
    type: 'effect', effect: 'delivery-retry', reminderId: m.reminderId,
    status: 'retry', sendAt: nextAllowed(m.now + m.retryDelay),
    removeSendRequest: true
  })
});

module.exports = {
  rules: d,
  ruleset: 'clinic_reminders',
  post: (event) => d.post('clinic_reminders', event),
  assert: (fact) => d.assert('clinic_reminders', fact),
  time: { isQuiet, nextAllowed, sendTime },
  message
};

// Example input (the host persists the asserted effect facts):
// const reminders = require('./reminder-durable');
// reminders.post({
//   type: 'schedule', now: 10000, nextReminderId: 1,
//   hasCurrentVersionReminder: false,
//   appointment: { id: 'A1', start: 12000, status: 'scheduled', version: 1 }
// });
