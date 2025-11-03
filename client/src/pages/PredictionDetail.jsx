import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { apiFetch } from '../api.js';
import { useAuth } from '../AuthContext.jsx';

export default function PredictionDetail() {
  const { token } = useAuth();
  const { id } = useParams();
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function loadDetail() {
      if (!token) return;
      try {
        const data = await apiFetch(`/api/predictions/${id}`, { token });
        setDetail(data);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    loadDetail();
  }, [token, id]);

  if (loading) {
    return <div>Loading prediction...</div>;
  }

  if (error) {
    return <div className="text-red-600">{error}</div>;
  }

  if (!detail) {
    return <div>Prediction not found.</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Prediction {detail.id}</h2>
        <Link className="text-indigo-600" to="/dashboard/history">Back to history</Link>
      </div>
      <div className="bg-white shadow rounded p-6 space-y-2 text-sm">
        <div><span className="font-medium">Student ID:</span> {detail.studentId}</div>
        <div><span className="font-medium">Created:</span> {new Date(detail.createdAt).toLocaleString()}</div>
        <div><span className="font-medium">Risk:</span> {detail.results?.risk || detail.summary?.risk || '—'}</div>
        <div><span className="font-medium">Input JSON:</span> <a className="text-indigo-600" href={detail.inputUrl} target="_blank" rel="noreferrer">Download</a></div>
        <div><span className="font-medium">Result JSON:</span> <a className="text-indigo-600" href={detail.resultUrl} target="_blank" rel="noreferrer">Download</a></div>
      </div>
      <section className="bg-white shadow rounded p-6">
        <h3 className="text-lg font-semibold mb-3">Predictions</h3>
        <pre className="bg-slate-900 text-green-200 text-xs p-4 rounded whitespace-pre-wrap overflow-auto">
          {JSON.stringify(detail.results, null, 2)}
        </pre>
      </section>
    </div>
  );
}
