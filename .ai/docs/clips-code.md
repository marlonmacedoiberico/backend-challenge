; See natural language rules in file  enunciado.pdf , page 1, section "Cuándo sale el recordatorio"

; ============================================================
; CLINIC APPOINTMENT REMINDER EXPERT SYSTEM
; ============================================================
;
; Requirements: R1 through R9
; Time model:
;   Integer minutes since a fixed local-calendar epoch.
;   1 day = 1440 minutes.
;   No daylight saving time or UTC conversion.
;
; Status values:
;   Appointment: scheduled, confirmed, cancelled
;   Reminder: pending, sending, retry, sent,
;             skipped, cancelled
;
; Integration:
;   The application supplies clock updates and events.
;   A send-request fact represents a provider invocation.
; ============================================================


; ------------------------------------------------------------
; DATA MODEL
; ------------------------------------------------------------

(deftemplate clock
   (slot now (type INTEGER)))

(deftemplate clinic
   (slot id)
   (slot name))

(deftemplate patient
   (slot id)
   (slot name)
   (slot phone (default none))
   (slot accepts-reminders (default yes)))

(deftemplate appointment
   (slot id)
   (slot clinic-id)
   (slot patient-id)
   (slot start (type INTEGER))
   (slot date-text)
   (slot time-text)
   (slot status (default scheduled))
   (slot version (type INTEGER) (default 1)))

(deftemplate reminder
   (slot id)
   (slot appointment-id)
   (slot version)
   (slot send-at (type INTEGER))
   (slot status (default pending))
   (slot reason (default none))
   (slot attempts (type INTEGER) (default 0)))

(deftemplate reminder-sequence
   (slot next-id (type INTEGER)))

(deftemplate schedule-request
   (slot appointment-id))

(deftemplate reschedule-request
   (slot appointment-id)
   (slot new-start (type INTEGER))
   (slot new-date-text)
   (slot new-time-text))

(deftemplate cancel-request
   (slot appointment-id))

(deftemplate send-request
   (slot reminder-id)
   (slot phone)
   (slot message))

(deftemplate delivery-result
   (slot reminder-id)
   (slot outcome))

(deftemplate delivery-policy
   (slot retry-delay (type INTEGER) (default 5)))


; ------------------------------------------------------------
; HELPER FUNCTIONS
; ------------------------------------------------------------

; R2: Previous local calendar day at the same local time.
; DST is deliberately ignored.
(deffunction previous-day (?start)
   (return (- ?start 1440)))


; R3: Quiet hours are [21:00, 09:00).
; 21:00 is blocked; 09:00 is permitted.
(deffunction quiet-hours (?timestamp)
   (bind ?minute-of-day (mod ?timestamp 1440))

   (if (or (< ?minute-of-day 540)
           (>= ?minute-of-day 1260))
      then
      (return TRUE))

   (return FALSE))


; R3: Move a blocked timestamp to the next 09:00.
(deffunction next-allowed-time (?timestamp)
   (bind ?minute-of-day (mod ?timestamp 1440))

   (if (< ?minute-of-day 540)
      then
      (return (+ ?timestamp (- 540 ?minute-of-day))))

   (if (>= ?minute-of-day 1260)
      then
      (return (+ ?timestamp
                 (- 1440 ?minute-of-day)
                 540)))

   (return ?timestamp))


; R2, R3, R4:
; Calculate the effective reminder time.
(deffunction calculate-send-time (?start ?now)
   ; R2: Same local time on previous day.
   (bind ?candidate (previous-day ?start))

   ; R4: If that time is already past, use now.
   (if (< ?candidate ?now)
      then
      (bind ?candidate ?now))

   ; R3: Apply quiet hours to the resulting time.
   (return (next-allowed-time ?candidate)))


; R7: Build the exact required message.
; Date and time strings are supplied in clinic-local format.
(deffunction reminder-message
   (?patient-name ?clinic-name ?date ?time)

   (return
      (str-cat
         "Hola " ?patient-name
         ", te recordamos tu cita en " ?clinic-name
         " el " ?date
         " a las " ?time
         ". Responde SI para confirmar o NO para cancelar.")))


; ------------------------------------------------------------
; R8: RESCHEDULING
; ------------------------------------------------------------
;
; The previous pending reminder becomes cancelled.
; A sent reminder remains sent for historical purposes.
; The appointment gets a new version.
; A confirmed appointment returns to scheduled.
; A new scheduling request is generated.
;
; In this standalone model, the application should serialize
; lifecycle events and delivery processing for each appointment.
; ------------------------------------------------------------

(defrule R8-reschedule-appointment
   (declare (salience 100))

   ?event <- (reschedule-request
      (appointment-id ?aid)
      (new-start ?new-start)
      (new-date-text ?new-date)
      (new-time-text ?new-time))

   ?a <- (appointment
      (id ?aid)
      (status ?status&~cancelled)
      (version ?version))

   =>
   ; Cancel pending or retrying reminders for this appointment.
   (do-for-all-facts
      ((?r reminder))
      (and (eq ?r:appointment-id ?aid)
           (or (eq ?r:status pending)
               (eq ?r:status retry)))
      (modify ?r
         (status cancelled)
         (reason rescheduled)))

   ; Invalidate a previously requested but unfinished send.
   (do-for-all-facts
      ((?r reminder))
      (and (eq ?r:appointment-id ?aid)
           (eq ?r:status sending))
      (modify ?r
         (status cancelled)
         (reason rescheduled)))

   (do-for-all-facts
      ((?s send-request))
      (eq ?s:reminder-id none)
      (retract ?s))

   ; Invalidate the old schedule and confirmation.
   (modify ?a
      (start ?new-start)
      (date-text ?new-date)
      (time-text ?new-time)
      (version (+ ?version 1))
      (status scheduled))

   (retract ?event)

   ; Create a reminder for the new appointment time.
   (assert (schedule-request (appointment-id ?aid))))


; ------------------------------------------------------------
; R9: APPOINTMENT CANCELLATION
; ------------------------------------------------------------
;
; A cancelled appointment must not have an active reminder.
; Previously sent reminders are retained as history.
; ------------------------------------------------------------

(defrule R9-cancel-appointment
   (declare (salience 100))

   ?event <- (cancel-request (appointment-id ?aid))

   ?a <- (appointment
      (id ?aid)
      (status ?status&~cancelled))

   =>
   (do-for-all-facts
      ((?r reminder))
      (and (eq ?r:appointment-id ?aid)
           (or (eq ?r:status pending)
               (eq ?r:status retry)
               (eq ?r:status sending)))
      (modify ?r
         (status cancelled)
         (reason appointment_cancelled)))

   (modify ?a (status cancelled))
   (retract ?event))


; ------------------------------------------------------------
; R1: CREATE ONE REMINDER FOR THE CURRENT APPOINTMENT
; ------------------------------------------------------------
;
; A new reminder is created when:
;   - an appointment is first scheduled
;   - an appointment is rescheduled (R8)
;
; The appointment version prevents duplicates.
;
; R2: The scheduled time is the same local hour on the
;     previous calendar day.
;
; R3: Quiet hours are applied.
;
; R4: Past candidate times are replaced with now.
; ------------------------------------------------------------

(defrule R1-R2-R3-R4-create-reminder
   (declare (salience 80))

   ?request <- (schedule-request (appointment-id ?aid))

   (clock (now ?now))

   (appointment
      (id ?aid)
      (start ?start)
      (status ?status&~cancelled)
      (version ?version))

   ?seq <- (reminder-sequence (next-id ?next-id))

   (not (reminder
      (appointment-id ?aid)
      (version ?version)))

   =>
   (bind ?send-at (calculate-send-time ?start ?now))

   (assert
      (reminder
         (id ?next-id)
         (appointment-id ?aid)
         (version ?version)
         (send-at ?send-at)
         (status pending)))

   (modify ?seq (next-id (+ ?next-id 1)))
   ; Removes the schedule-request fact that triggered the rule
   (retract ?request))  


; R1: Remove duplicate or obsolete scheduling requests.
(defrule R1-discard-redundant-request
   (declare (salience 79))

   ?request <- (schedule-request (appointment-id ?aid))

   (appointment
      (id ?aid)
      (version ?version))

   (reminder
      (appointment-id ?aid)
      (version ?version))

   =>
   (retract ?request))


; ------------------------------------------------------------
; R5: SKIP REMINDERS THAT ARE TOO LATE
; ------------------------------------------------------------
;
; This applies:
;   - immediately after creation
;   - while waiting
;   - before a retry
;   - after the appointment has started
;
; R5 has priority over patient eligibility and sending.
; ------------------------------------------------------------

(defrule R5-skip-too-late
   (declare (salience 70))

   (clock (now ?now))

   ?r <- (reminder
      (status ?status&:(or (eq ?status pending)
                           (eq ?status retry)))
      (send-at ?send-at)
      (appointment-id ?aid))

   (appointment
      (id ?aid)
      (start ?start))

   (test (or (>= ?send-at ?start)
             (>= ?now ?start)))

   =>
   (modify ?r
      (status skipped)
      (reason too_late)))


; ------------------------------------------------------------
; R6: SKIP IF PATIENT HAS NO PHONE
; ------------------------------------------------------------
;
; Eligibility is evaluated when the reminder is due.
; No provider request is created.
; ------------------------------------------------------------

(defrule R6-skip-no-phone
   (declare (salience 60))

   (clock (now ?now))

   ?r <- (reminder
      (status ?status&:(or (eq ?status pending)
                           (eq ?status retry)))
      (send-at ?send-at&:(<= ?send-at ?now))
      (appointment-id ?aid))

   (appointment
      (id ?aid)
      (patient-id ?pid)
      (start ?start&:(> ?start ?now)))

   (patient
      (id ?pid)
      (phone none))

   =>
   (modify ?r
      (status skipped)
      (reason no_phone)))


; ------------------------------------------------------------
; R6: SKIP IF PATIENT OPTED OUT
; ------------------------------------------------------------
;
; No provider request is created.
; ------------------------------------------------------------

(defrule R6-skip-opted-out
   (declare (salience 59))

   (clock (now ?now))

   ?r <- (reminder
      (status ?status&:(or (eq ?status pending)
                           (eq ?status retry)))
      (send-at ?send-at&:(<= ?send-at ?now))
      (appointment-id ?aid))

   (appointment
      (id ?aid)
      (patient-id ?pid)
      (start ?start&:(> ?start ?now)))

   (patient
      (id ?pid)
      (accepts-reminders no))

   =>
   (modify ?r
      (status skipped)
      (reason opted_out)))


; ------------------------------------------------------------
; R3, R5, R6, R7: REQUEST DELIVERY
; ------------------------------------------------------------
;
; The reminder must:
;   - be due
;   - be outside quiet hours
;   - precede appointment start
;   - have a valid phone
;   - have patient consent
;   - match the current appointment version
;
; R7: The exact Spanish message is generated.
;
; The rule does not directly call a messaging provider.
; Instead, it creates a send-request fact.
; ------------------------------------------------------------

(defrule R3-R5-R6-R7-request-delivery
   (declare (salience 40))

   (clock (now ?now))

   ?r <- (reminder
      (id ?rid)
      (appointment-id ?aid)
      (version ?version)
      (status ?status&:(or (eq ?status pending)
                           (eq ?status retry)))
      (send-at ?send-at&:(<= ?send-at ?now))
      (attempts ?attempts))

   (appointment
      (id ?aid)
      (clinic-id ?cid)
      (patient-id ?pid)
      (start ?start&:(> ?start ?now))
      (status ?appointment-status&~cancelled)
      (version ?version)
      (date-text ?date)
      (time-text ?time))

   (clinic (id ?cid) (name ?clinic-name))

   (patient
      (id ?pid)
      (name ?patient-name)
      (phone ?phone&~none)
      (accepts-reminders yes))

   (test (not (quiet-hours ?now)))

   (not (send-request (reminder-id ?rid)))

   =>
   (bind ?message
      (reminder-message
         ?patient-name ?clinic-name ?date ?time))

   (modify ?r
      (status sending)
      (attempts (+ ?attempts 1)))

   (assert
      (send-request
         (reminder-id ?rid)
         (phone ?phone)
         (message ?message))))


; ------------------------------------------------------------
; R3: DEFER A DUE REMINDER DURING QUIET HOURS
; ------------------------------------------------------------
;
; Applies also to retries.
; If the adjusted time is too late, R5 will skip it.
; ------------------------------------------------------------

(defrule R3-defer-during-quiet-hours
   (declare (salience 65))

   (clock (now ?now))

   ?r <- (reminder
      (status ?status&:(or (eq ?status pending)
                           (eq ?status retry)))
      (send-at ?send-at&:(<= ?send-at ?now)))

   (test (quiet-hours ?now))

   =>
   (modify ?r
      (send-at (next-allowed-time ?now))))


; ------------------------------------------------------------
; R5: PROVIDER SUCCESS
; ------------------------------------------------------------
;
; A successful delivery becomes sent.
; ------------------------------------------------------------

(defrule delivery-success
   (declare (salience 50))

   ?result <- (delivery-result
      (reminder-id ?rid)
      (outcome success))

   ?request <- (send-request (reminder-id ?rid))

   ?r <- (reminder
      (id ?rid)
      (status sending))

   =>
   (modify ?r (status sent))
   (retract ?request ?result))


; ------------------------------------------------------------
; R5: PROVIDER FAILURE / RETRY
; ------------------------------------------------------------
;
; A failed delivery is rescheduled for a later attempt.
; R3 and R5 will be checked again.
; ------------------------------------------------------------

(defrule delivery-failure
   (declare (salience 50))

   (clock (now ?now))

   (delivery-policy (retry-delay ?delay))

   ?result <- (delivery-result
      (reminder-id ?rid)
      (outcome failure))

   ?request <- (send-request (reminder-id ?rid))

   ?r <- (reminder
      (id ?rid)
      (status sending))

   =>
   (modify ?r
      (status retry)
      (send-at (next-allowed-time (+ ?now ?delay))))

   (retract ?request ?result))


; ------------------------------------------------------------
; INITIAL CONFIGURATION
; ------------------------------------------------------------

(deffacts configuration
   (reminder-sequence (next-id 1))
   (delivery-policy (retry-delay 5)))
