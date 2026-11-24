(() => {
  const byId = (id) => document.getElementById(id);
  const dialogs = [...document.querySelectorAll('dialog')];
  const open = (id) => byId(id)?.showModal();
  const close = (element) => element.closest('dialog')?.close();
  const toLocalInput = (value) => [value.slice(0, 10), value.slice(11, 19)];

  document.addEventListener('click', async (event) => {
    const target = event.target.closest('button');
    if (!target) return;
    if (target.matches('[data-close]')) return close(target);
    if (target.matches('[data-open-reset]')) return open('reset-dialog');
    if (target.matches('[data-new-clinic]')) {
      byId('clinic-form').reset(); byId('clinic-id').value = '';
      byId('clinic-dialog-title').textContent = 'Create clinic'; return open('clinic-dialog');
    }
    if (target.matches('[data-edit-clinic]')) {
      byId('clinic-id').value = target.dataset.id;
      byId('clinic-name').value = target.dataset.name;
      byId('clinic-timezone').value = target.dataset.timezone;
      byId('clinic-dialog-title').textContent = 'Edit clinic'; return open('clinic-dialog');
    }
    if (target.matches('[data-new-patient]')) {
      byId('patient-form').reset(); byId('patient-id').value = '';
      byId('patient-clinic').disabled = false; byId('patient-clinic').required = true;
      byId('patient-accepts').value = 'true';
      byId('patient-dialog-title').textContent = 'Create patient'; return open('patient-dialog');
    }
    if (target.matches('[data-edit-patient]')) {
      byId('patient-id').value = target.dataset.id;
      byId('patient-name').value = target.dataset.name;
      byId('patient-phone').value = target.dataset.phone;
      byId('patient-accepts').value = target.dataset.accepts;
      byId('patient-clinic').value = '';
      byId('patient-clinic').disabled = true; byId('patient-clinic').required = false;
      byId('patient-dialog-title').textContent = 'Edit patient'; return open('patient-dialog');
    }
    if (target.matches('[data-open-appointment]')) {
      const form = byId('appointment-form'); form.reset();
      form.action = form.dataset.createUrl;
      byId('appointment-dialog-title').textContent = 'Create appointment';
      byId('appointment-relations').hidden = false;
      byId('appointment-clinic').disabled = false; byId('appointment-patient').disabled = false;
      byId('appointment-date').value = ''; byId('appointment-time').value = '00:00:00';
      return open('appointment-dialog');
    }
    if (target.matches('[data-reschedule]')) {
      const form = byId('appointment-form');
      form.action = `/appointment/${target.dataset.reschedule}/reschedule`;
      byId('appointment-dialog-title').textContent = 'Reschedule appointment';
      byId('appointment-relations').hidden = true;
      byId('appointment-clinic').disabled = true; byId('appointment-patient').disabled = true;
      [byId('appointment-date').value, byId('appointment-time').value] = toLocalInput(target.dataset.startsAt);
      return open('appointment-dialog');
    }
    if (target.matches('[data-view-appointment]')) {
      const list = byId('appointment-details');
      list.replaceChildren(document.createTextNode('Loading appointment…'));
      open('view-dialog');
      try {
        const response = await fetch(`/appointment/${encodeURIComponent(target.dataset.viewAppointment)}/details`);
        const appointment = await response.json();
        if (!response.ok) throw new Error(appointment.error || 'Could not load appointment.');
        const entries = [
          ['Appointment ID', appointment.id], ['Clinic', appointment.clinicName || appointment.clinicId],
          ['Patient', appointment.patientName || appointment.patientId], ['Starts at (UTC)', appointment.startsAt],
          ['Status', appointment.status],
        ];
        for (const reminder of appointment.reminders || []) {
          entries.push([`Reminder · ${reminder.status}`, `${reminder.scheduledFor} · ${reminder.attempts} attempt(s)`]);
        }
        list.replaceChildren(...entries.flatMap(([term, value]) => {
          const dt = document.createElement('dt'); dt.textContent = term;
          const dd = document.createElement('dd'); dd.textContent = value ?? '—';
          return [dt, dd];
        }));
      } catch (error) {
        list.textContent = error.message;
      }
    }
  });

  document.querySelectorAll('form[data-confirm]').forEach((form) => {
    form.addEventListener('submit', (event) => {
      if (!window.confirm(form.dataset.confirm)) event.preventDefault();
    });
  });
  document.querySelectorAll('form').forEach((form) => {
    form.addEventListener('submit', () => {
      if (!form.reportValidity()) return;
      const button = form.querySelector('button[type="submit"]');
      if (button && !button.disabled) {
        button.disabled = true;
        button.dataset.originalText = button.textContent;
        button.textContent = 'Working…';
      }
    });
  });
  dialogs.forEach((dialog) => dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close();
  }));
  byId('patient-form').addEventListener('submit', () => { byId('patient-clinic').disabled = false; });
})();
