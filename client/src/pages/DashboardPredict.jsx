import React, { useEffect, useState } from 'react';
import { apiFetch, createEventSource } from '../api.js';
import { useAuth } from '../AuthContext.jsx';

export default function DashboardPredict() {
  const { token } = useAuth();
  const [mode, setMode] = useState('upload');
  const [file, setFile] = useState(null);
  const [jsonText, setJsonText] = useState('');
  const [predictionId, setPredictionId] = useState(null);
  const [logs, setLogs] = useState('');
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);

  useEffect(() => {
    let source;
    if (predictionId && token) {
      source = createEventSource(`/api/predict/${predictionId}/logs`, token);
      source.onmessage = (event) => {
        if (!event.data) return;
        setLogs((prev) => `${prev}${event.data}\n`);
        if (event.data.includes('__RESULT__')) {
          try {
            const payload = JSON.parse(event.data.replace('__RESULT__', ''));
            setResult(payload);
          } catch (err) {
            console.error('Failed to parse prediction payload', err);
          }
        }
      };
      source.onerror = () => source.close();
    }
    return () => {
      if (source) source.close();
    };
  }, [predictionId, token]);

  useEffect(() => {
    async function fetchDetail() {
      if (!predictionId || !token) return;
      try {
        const detail = await apiFetch(`/api/predictions/${predictionId}`, { token });
        if (detail?.results?.status === 'ok') {
          setResult(detail.results);
        }
      } catch (err) {
        console.warn('Failed to fetch prediction detail', err);
      }
    }
    if (result?.status === 'ok') {
      fetchDetail();
    }
  }, [predictionId, token, result?.status]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLogs('');
    setResult(null);

    if (mode === 'upload' && !file) {
      setError('Please upload a student JSON file.');
      return;
    }
    if (mode === 'paste' && !jsonText.trim()) {
      setError('Provide student JSON data.');
      return;
    }

    setSubmitting(true);

    try {
      let response;
      if (mode === 'upload') {
        const formData = new FormData();
        formData.append('file', file);
        response = await apiFetch('/api/predict', { method: 'POST', body: formData, token });
      } else {
        const formData = new FormData();
        formData.append('jsonText', jsonText);
        response = await apiFetch('/api/predict', { method: 'POST', body: formData, token });
      }
      setPredictionId(response.predictionId);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <section className="bg-white shadow rounded p-6 space-y-4">
        <h2 className="text-xl font-semibold">Run Prediction</h2>
        <p className="text-sm text-gray-600">Upload a JSON file or paste the payload to run inference against the latest model.</p>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="flex space-x-4">
            <label className="flex items-center space-x-2">
              <input type="radio" value="upload" checked={mode === 'upload'} onChange={() => setMode('upload')} />
              <span>Upload file</span>
            </label>
            <label className="flex items-center space-x-2">
              <input type="radio" value="paste" checked={mode === 'paste'} onChange={() => setMode('paste')} />
              <span>Paste JSON</span>
            </label>
          </div>

          {mode === 'upload' ? (
            <div>
              <label className="block text-sm font-medium mb-1">Student JSON file</label>
              <input type="file" accept="application/json" onChange={(e) => setFile(e.target.files?.[0] || null)} className="border rounded px-3 py-2" />
            </div>
          ) : (
            <div>
              <label className="block text-sm font-medium mb-1">Student JSON</label>
              <textarea
                rows={10}
                className="w-full border rounded px-3 py-2 font-mono text-sm"
                value={jsonText}
                onChange={(e) => setJsonText(e.target.value)}
              />
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="bg-indigo-600 text-white px-4 py-2 rounded hover:bg-indigo-700 disabled:opacity-50"
          >
            {submitting ? 'Submitting...' : 'Run Prediction'}
          </button>
          {error && <div className="text-red-600 text-sm">{error}</div>}
        </form>
      </section>

      {predictionId && (
        <section className="bg-white shadow rounded p-6 space-y-4">
          <h3 className="text-lg font-semibold">Prediction Logs</h3>
          <pre className="bg-black text-green-300 text-xs p-4 rounded h-64 overflow-auto whitespace-pre-wrap">{logs || 'Waiting...'}</pre>
        </section>
      )}

      {result && (
        <section className="bg-white shadow rounded p-6 space-y-3">
          <h3 className="text-lg font-semibold">Results</h3>
          <div className="text-sm">
            <div><span className="font-medium">Risk:</span> {result.risk}</div>
            <div><span className="font-medium">Current:</span> {JSON.stringify(result.current)}</div>
          </div>
          <pre className="bg-slate-900 text-green-200 text-xs p-4 rounded whitespace-pre-wrap overflow-auto">
            {JSON.stringify(result.predictions, null, 2)}
          </pre>
        </section>
      )}
    </div>
  );
}
