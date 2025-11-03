export async function apiFetch(path, { method = 'GET', token, body, headers = {}, json = true } = {}) {
  const opts = { method, headers: { ...headers } };

  if (body instanceof FormData) {
    opts.body = body;
  } else if (body !== undefined && body !== null) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }

  if (token) {
    opts.headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(path, opts);
  const isJson = response.headers.get('content-type')?.includes('application/json');
  if (!response.ok) {
    if (isJson) {
      const errorBody = await response.json();
      throw new Error(errorBody.error || 'Request failed');
    }
    throw new Error(`Request failed with status ${response.status}`);
  }

  if (!json) {
    return response;
  }

  if (isJson) {
    return response.json();
  }

  return null;
}

export function createEventSource(url, token) {
  const fullUrl = token ? `${url}${url.includes('?') ? '&' : '?'}token=${encodeURIComponent(token)}` : url;
  return new EventSource(fullUrl);
}
