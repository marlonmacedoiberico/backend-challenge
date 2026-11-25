import assert from 'node:assert/strict';
import test from 'node:test';
import {
  InboundReplyUseCase,
} from '../../src/usecases/inbound-reply-use-case.js';
import type {
  AppointmentContext,
  InboundMessage,
} from '../../src/domain/model.js';
import { fixture, reminder } from '../helpers/fake-clinic-say.js';

function addAppointment(
  context: ReturnType<typeof fixture>,
  id: string,
  startsAt = '2027-03-28T08:00:00.000Z',
): AppointmentContext {
  const appointment = {
    ...context.appointment,
    id,
    startsAt: new Date(startsAt),
    status: 'scheduled' as const,
  };
  context.repository.appointments.set(id, appointment);
  return { ...context.repository.context(id)!, reminders: [] };
}

function inbound(messageId: string, text: string): InboundMessage {
  return {
    messageId,
    from: '+34600111222',
    text,
    receivedAt: new Date('2027-03-01T08:00:00.000Z'),
  };
}

function sentReminder(
  appointmentId: string,
  id: string,
  sentAt: string,
  createdAt: string,
) {
  return reminder({
    id,
    appointmentId,
    status: 'sent',
    sentAt: new Date(sentAt),
    createdAt: new Date(createdAt),
    attempts: 1,
  });
}

test(
  'InboundReplyUseCase normalizes accented SI and confirms the appointment',
  async () => {
    const context = fixture();
    context.repository.reminders.set(
      'sent-1',
      sentReminder(
        'appointment-1',
        'sent-1',
        '2027-02-28T08:00:00.000Z',
        '2027-02-27T08:00:00.000Z',
      ),
    );

    await new InboundReplyUseCase(context.repository, context.clock).process(
      inbound('msg-1', '  \u00a1S\u00ed!  '),
    );

    assert.equal(
      context.repository.appointments.get('appointment-1')?.status,
      'confirmed',
    );
  },
);

test(
  'InboundReplyUseCase applies NO to the appointment with latest reminder',
  async () => {
    const context = fixture();
    addAppointment(context, 'appointment-2');
    context.repository.reminders.set(
      'older',
      sentReminder(
        'appointment-1',
        'older',
        '2027-02-28T08:00:00.000Z',
        '2027-02-27T08:00:00.000Z',
      ),
    );
    context.repository.reminders.set(
      'newer',
      sentReminder(
        'appointment-2',
        'newer',
        '2027-02-28T09:00:00.000Z',
        '2027-02-27T09:00:00.000Z',
      ),
    );
    context.repository.reminders.set(
      'pending',
      reminder({
        id: 'pending',
        appointmentId: 'appointment-2',
        status: 'pending',
        sentAt: null,
      }),
    );

    await new InboundReplyUseCase(context.repository, context.clock).process(
      inbound('msg-2', 'no'),
    );

    assert.equal(
      context.repository.appointments.get('appointment-1')?.status,
      'scheduled',
    );
    assert.equal(
      context.repository.appointments.get('appointment-2')?.status,
      'cancelled',
    );
    assert.equal(
      context.repository.reminders.get('pending')?.status,
      'cancelled',
    );
  },
);

test(
  'InboundReplyUseCase uses reminder creation time when sent times tie',
  async () => {
    const context = fixture();
    addAppointment(context, 'appointment-2');
    context.repository.reminders.set(
      'earlier-created',
      sentReminder(
        'appointment-1',
        'earlier-created',
        '2027-02-28T08:00:00.000Z',
        '2027-02-27T08:00:00.000Z',
      ),
    );
    context.repository.reminders.set(
      'later-created',
      sentReminder(
        'appointment-2',
        'later-created',
        '2027-02-28T08:00:00.000Z',
        '2027-02-27T09:00:00.000Z',
      ),
    );

    await new InboundReplyUseCase(context.repository, context.clock).process(
      inbound('msg-3', 'SI'),
    );

    assert.equal(
      context.repository.appointments.get('appointment-1')?.status,
      'scheduled',
    );
    assert.equal(
      context.repository.appointments.get('appointment-2')?.status,
      'confirmed',
    );
  },
);

test(
  'InboundReplyUseCase uses reminder ID as final tie-break',
  async () => {
    const context = fixture();
    addAppointment(context, 'appointment-2');
    const sentAt = '2027-02-28T08:00:00.000Z';
    const createdAt = '2027-02-27T08:00:00.000Z';
    context.repository.reminders.set(
      'reminder-a',
      sentReminder('appointment-1', 'reminder-a', sentAt, createdAt),
    );
    context.repository.reminders.set(
      'reminder-b',
      sentReminder('appointment-2', 'reminder-b', sentAt, createdAt),
    );

    await new InboundReplyUseCase(context.repository, context.clock).process(
      inbound('msg-4', 'SI'),
    );

    assert.equal(
      context.repository.appointments.get('appointment-1')?.status,
      'scheduled',
    );
    assert.equal(
      context.repository.appointments.get('appointment-2')?.status,
      'confirmed',
    );
  },
);

test(
  'InboundReplyUseCase ignores replies when no eligible sent reminder exists',
  async (t) => {
    await t.test('appointment already started', async () => {
      const context = fixture({
        startsAt: '2027-03-01T07:00:00.000Z',
      });
      context.repository.reminders.set(
        'sent',
        sentReminder(
          'appointment-1',
          'sent',
          '2027-02-28T08:00:00.000Z',
          '2027-02-27T08:00:00.000Z',
        ),
      );
      await new InboundReplyUseCase(context.repository, context.clock).process(
        inbound('msg-5a', 'SI'),
      );
      assert.equal(
        context.repository.appointments.get('appointment-1')?.status,
        'scheduled',
      );
    });

    await t.test('appointment reminder has not been sent', async () => {
      const context = fixture();
      context.repository.reminders.set('pending', reminder());
      await new InboundReplyUseCase(context.repository, context.clock).process(
        inbound('msg-5b', 'SI'),
      );
      assert.equal(
        context.repository.appointments.get('appointment-1')?.status,
        'scheduled',
      );
    });
  },
);

test(
  'InboundReplyUseCase ignores unknown text and processes duplicates once',
  async () => {
    const context = fixture();
    context.repository.reminders.set(
      'sent',
      sentReminder(
        'appointment-1',
        'sent',
        '2027-02-28T08:00:00.000Z',
        '2027-02-27T08:00:00.000Z',
      ),
    );
    const useCase = new InboundReplyUseCase(
      context.repository,
      context.clock,
    );

    await useCase.process(inbound('msg-6', 'Maybe later'));
    assert.equal(
      context.repository.appointments.get('appointment-1')?.status,
      'scheduled',
    );
    await useCase.process(inbound('msg-6', 'NO'));
    assert.equal(
      context.repository.appointments.get('appointment-1')?.status,
      'scheduled',
    );
  },
);
