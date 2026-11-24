"""Small server-side HTTP client for the ClinicSay API."""

from __future__ import annotations

import json
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen


class APIError(Exception):
    def __init__(self, message: str, status: int | None = None):
        super().__init__(message)
        self.status = status


class APIClient:
    def __init__(self, base_url: str, timeout: float = 8.0):
        self.base_url = base_url.rstrip('/')
        self.timeout = timeout

    def request(self, method: str, path: str, data=None, query=None):
        url = f'{self.base_url}{path}'
        if query:
            url = f'{url}?{urlencode(query)}'
        body = None if data is None else json.dumps(data).encode('utf-8')
        headers = {'Accept': 'application/json'}
        if body is not None:
            headers['Content-Type'] = 'application/json'
        request = Request(url, data=body, headers=headers, method=method)
        try:
            with urlopen(request, timeout=self.timeout) as response:
                raw = response.read()
                if not raw:
                    return None
                return json.loads(raw.decode('utf-8'))
        except HTTPError as error:
            raw = error.read()
            try:
                payload = json.loads(raw.decode('utf-8')) if raw else {}
            except (UnicodeDecodeError, json.JSONDecodeError):
                payload = {}
            message = payload.get('error', f'API returned HTTP {error.code}')
            raise APIError(str(message), error.code) from error
        except (URLError, TimeoutError, OSError) as error:
            raise APIError(f'Could not reach the ClinicSay API: {error}') from error

    def get(self, path, query=None):
        return self.request('GET', path, query=query)

    def post(self, path, data=None):
        return self.request('POST', path, data=data)

    def patch(self, path, data):
        return self.request('PATCH', path, data=data)

    def put(self, path, data):
        return self.request('PUT', path, data=data)

    def delete(self, path):
        return self.request('DELETE', path)
