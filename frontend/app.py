from __future__ import annotations

import os
from datetime import datetime, timezone
from uuid import uuid4

from flask import Flask, flash, jsonify, redirect, render_template, request, session, url_for

from api_client import APIClient, APIError


app = Flask(__name__)
app.config['SECRET_KEY'] = os.environ.get('FLASK_SECRET_KEY', 'local-clinicsay-test-ui')
app.config['API_BASE_URL'] = os.environ.get('API_BASE_URL', 'http://localhost:3000')


def api() -> APIClient:
    return APIClient(app.config['API_BASE_URL'])


def api_timestamp(date_value: str, time_value: str) -> str:
    if not date_value or not time_value:
        raise ValueError('Choose both a date and time in UTC.')
    time_part = time_value if len(time_value.split(':')) == 3 else f'{time_value}:00'
    try:
        parsed = datetime.fromisoformat(f'{date_value}T{time_part}')
    except ValueError as error:
        raise ValueError('Enter a valid UTC date and time.') from error
    if parsed.tzinfo is not None:
        raise ValueError('Enter the date and time as UTC without a local offset.')
    return parsed.replace(tzinfo=timezone.utc).isoformat(timespec='seconds').replace('+00:00', 'Z')


def read_collection(client: APIClient, key: str, path: str):
    try:
        value = client.get(path)
        if not isinstance(value, list):
            raise APIError(f'Expected a list from {path}.')
        return value
    except APIError as error:
        flash(f'{key}: {error}', 'error')
        return []


@app.get('/')
def index():
    client = api()
    data = {
        'clinics': read_collection(client, 'Clinics could not be loaded', '/clinics'),
        'patients': read_collection(client, 'Patients could not be loaded', '/patients'),
        'appointments': read_collection(client, 'Appointments could not be loaded', '/appointments'),
        'reminders': read_collection(client, 'Reminders could not be loaded', '/reminders'),
        'messages': read_collection(client, 'Delivered messages could not be loaded', '/admin/messages'),
        'provider_requests': read_collection(client, 'Provider requests could not be loaded', '/admin/requests'),
    }
    return render_template(
        'index.html',
        **data,
        clock_value=session.get('clock_value'),
        clinic_by_id={item['id']: item for item in data['clinics']},
        patient_by_id={item['id']: item for item in data['patients']},
        appointment_by_id={item['id']: item for item in data['appointments']},
    )


@app.get('/appointment/<appointment_id>/details')
def appointment_details(appointment_id):
    try:
        client = api()
        appointment = client.get(f'/appointments/{appointment_id}')
        clinic = client.get(f"/clinics/{appointment['clinicId']}")
        patient = client.get(f"/patients/{appointment['patientId']}")
        appointment['clinicName'] = clinic.get('name')
        appointment['patientName'] = patient.get('name')
        return jsonify(appointment)
    except APIError as error:
        return jsonify({'error': str(error)}), error.status or 502


@app.post('/refresh')
def refresh():
    flash('All available records were refreshed.', 'success')
    return redirect(url_for('index'))


@app.post('/clock')
def set_clock():
    try:
        stamp = api_timestamp(request.form.get('date', ''), request.form.get('time', ''))
        api().put('/test/clock', {'now': stamp})
        session['clock_value'] = stamp
        flash(f'Backend clock set to {stamp}.', 'success')
    except (APIError, ValueError) as error:
        flash(str(error), 'error')
    return redirect(url_for('index'))


@app.post('/reminders/run')
def run_reminders():
    try:
        result = api().post('/jobs/reminders/run') or {}
        flash(f"Reminder run complete: {result.get('processed', 0)} processed.", 'success')
    except APIError as error:
        flash(f'Reminder run failed: {error}', 'error')
    return redirect(url_for('index'))


@app.post('/clinic')
def save_clinic():
    clinic_id = request.form.get('id', '').strip()
    payload = {
        'name': request.form.get('name', '').strip(),
        'timezone': request.form.get('timezone', '').strip(),
    }
    try:
        if clinic_id:
            api().patch(f'/clinics/{clinic_id}', payload)
            flash('Clinic updated.', 'success')
        else:
            api().post('/clinics', payload)
            flash('Clinic created.', 'success')
    except APIError as error:
        flash(f'Clinic could not be saved: {error}', 'error')
    return redirect(url_for('index'))


@app.post('/clinic/<clinic_id>/delete')
def delete_clinic(clinic_id):
    try:
        api().delete(f'/clinics/{clinic_id}')
        flash('Clinic deleted.', 'success')
    except APIError as error:
        flash(f'Clinic could not be deleted: {error}', 'error')
    return redirect(url_for('index'))


@app.post('/patient')
def save_patient():
    patient_id = request.form.get('id', '').strip()
    payload = {
        'name': request.form.get('name', '').strip(),
        'phone': request.form.get('phone', '').strip() or None,
        'acceptsReminders': request.form.get('acceptsReminders') == 'true',
    }
    if not patient_id:
        payload['clinicId'] = request.form.get('clinicId', '').strip()
    try:
        if patient_id:
            api().patch(f'/patients/{patient_id}', payload)
            flash('Patient updated.', 'success')
        else:
            api().post('/patients', payload)
            flash('Patient created.', 'success')
    except APIError as error:
        flash(f'Patient could not be saved: {error}', 'error')
    return redirect(url_for('index'))


@app.post('/patient/<patient_id>/delete')
def delete_patient(patient_id):
    try:
        api().delete(f'/patients/{patient_id}')
        flash('Patient deleted.', 'success')
    except APIError as error:
        flash(f'Patient could not be deleted: {error}', 'error')
    return redirect(url_for('index'))


@app.post('/appointment')
def create_appointment():
    try:
        payload = {
            'clinicId': request.form.get('clinicId', '').strip(),
            'patientId': request.form.get('patientId', '').strip(),
            'startsAt': api_timestamp(request.form.get('date', ''), request.form.get('time', '')),
        }
        api().post('/appointments', payload)
        flash('Appointment created.', 'success')
    except (APIError, ValueError) as error:
        flash(f'Appointment could not be created: {error}', 'error')
    return redirect(url_for('index'))


@app.post('/appointment/<appointment_id>/reschedule')
def reschedule_appointment(appointment_id):
    try:
        starts_at = api_timestamp(request.form.get('date', ''), request.form.get('time', ''))
        api().patch(f'/appointments/{appointment_id}', {'startsAt': starts_at})
        flash('Appointment rescheduled.', 'success')
    except (APIError, ValueError) as error:
        flash(f'Appointment could not be rescheduled: {error}', 'error')
    return redirect(url_for('index'))


@app.post('/appointment/<appointment_id>/cancel')
def cancel_appointment(appointment_id):
    try:
        api().post(f'/appointments/{appointment_id}/cancel')
        flash('Appointment cancelled.', 'success')
    except APIError as error:
        flash(f'Appointment could not be cancelled: {error}', 'error')
    return redirect(url_for('index'))


@app.post('/appointment/<appointment_id>/reply')
def send_reply(appointment_id):
    reply_text = request.form.get('text', '').strip().upper()
    try:
        if reply_text not in {'SI', 'NO'}:
            raise ValueError('Reply must be SI or NO.')
        appointment = api().get(f'/appointments/{appointment_id}')
        patient = api().get(f"/patients/{appointment['patientId']}")
        if not patient.get('phone'):
            raise ValueError('This patient has no phone number for a simulated reply.')
        received_at = session.get('clock_value') or datetime.now(timezone.utc).isoformat(timespec='seconds').replace('+00:00', 'Z')
        api().post('/webhooks/inbound-messages', {
            'messageId': str(uuid4()),
            'from': patient['phone'],
            'text': reply_text,
            'receivedAt': received_at,
        })
        flash(f'Simulated {reply_text} reply submitted.', 'success')
    except (APIError, ValueError, KeyError) as error:
        flash(f'Reply could not be submitted: {error}', 'error')
    return redirect(url_for('index'))


@app.post('/provider/reset')
def reset_provider():
    try:
        api().post('/admin/reset')
        flash('Provider simulator reset. ClinicSay records were not changed.', 'success')
    except APIError as error:
        flash(f'Provider simulator could not be reset: {error}', 'error')
    return redirect(url_for('index'))


if __name__ == '__main__':
    app.run(host=os.environ.get('FLASK_HOST', '127.0.0.1'), port=int(os.environ.get('FLASK_PORT', '5000')), debug=False)
