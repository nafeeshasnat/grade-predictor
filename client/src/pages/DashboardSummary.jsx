import React, { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { apiFetch } from '../api.js';
import { useAuth } from '../AuthContext.jsx';

export default function DashboardSummary() {
  const { token } = useAuth();
  const { status } = useOutletContext();
  const [summary, setSummary] = useState(null);
  const [predictions, setPredictions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function loadData() {
      if (!token) return;
      try {
        const [summaryResp, predictionsResp] = await Promise.all([
          apiFetch('/api/models/summary', { token }),
          apiFetch('/api/predictions?pageSize=5', { token })
        ]);
        setSummary(summaryResp);
        setPredictions(predictionsResp.items || []);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [token]);

  if (loading) {
    return <div>Loading summary...</div>;
  }

  if (error) {
    return <div className="text-red-600">{error}</div>;
  }

  if (!status?.hasModel) {
    return <div>Model not trained yet. Visit the training page to get started.</div>;
  }

  const gradeEntries = Object.entries(summary.gradePoints || {});

  return (
    <div className="space-y-6">
      <section className="bg-white shadow rounded p-6">
        <h2 className="text-xl font-semibold">Latest Metrics</h2>
        <div className="text-sm text-gray-600 mb-2">
          Trained at: {summary.trainedAt ? new Date(summary.trainedAt).toLocaleString() : 'N/A'}
          {summary.bestModel && (
            <span className="ml-2">• Best model: <span className="font-medium">{summary.bestModel}</span></span>
          )}
        </div>
        <pre className="bg-slate-900 text-green-200 text-xs p-4 rounded whitespace-pre-wrap overflow-auto">
          {JSON.stringify(summary.metrics, null, 2)}
        </pre>
      </section>

      <section className="bg-white shadow rounded p-6">
        <h2 className="text-xl font-semibold mb-3">Grade Scale</h2>
        <table className="min-w-sm border text-sm">
          <thead className="bg-gray-100">
            <tr>
              <th className="border px-3 py-1 text-left">Grade</th>
              <th className="border px-3 py-1 text-left">Points</th>
            </tr>
          </thead>
          <tbody>
            {gradeEntries.map(([grade, value]) => (
              <tr key={grade}>
                <td className="border px-3 py-1">{grade}</td>
                <td className="border px-3 py-1">{value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {summary.plots?.length > 0 && (
        <section className="bg-white shadow rounded p-6">
          <h2 className="text-xl font-semibold mb-3">Plots</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {summary.plots.map((plot) => (
              <img key={plot} src={plot} alt="Training plot" className="w-full border rounded" />
            ))}
          </div>
        </section>
      )}

      <section className="bg-white shadow rounded p-6">
        <h2 className="text-xl font-semibold mb-3">Recent Predictions</h2>
        {predictions.length === 0 ? (
          <p className="text-sm text-gray-600">No predictions yet.</p>
        ) : (
          <table className="w-full text-sm border">
            <thead className="bg-gray-100">
              <tr>
                <th className="border px-3 py-2 text-left">Prediction ID</th>
                <th className="border px-3 py-2 text-left">Student</th>
                <th className="border px-3 py-2 text-left">Created</th>
                <th className="border px-3 py-2 text-left">Risk</th>
              </tr>
            </thead>
            <tbody>
              {predictions.map((item) => (
                <tr key={item.id}>
                  <td className="border px-3 py-2">{item.id}</td>
                  <td className="border px-3 py-2">{item.studentId}</td>
                  <td className="border px-3 py-2">{new Date(item.createdAt).toLocaleString()}</td>
                  <td className="border px-3 py-2">{item.summary?.risk || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
