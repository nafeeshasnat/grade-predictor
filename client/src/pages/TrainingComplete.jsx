import React, { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { apiFetch } from '../api.js';
import { useAuth } from '../AuthContext.jsx';

export default function TrainingComplete() {
  const { token } = useAuth();
  const location = useLocation();
  const [summary, setSummary] = useState(null);
  const [initialResult] = useState(location.state?.result || null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function fetchSummary() {
      if (!token) {
        setLoading(false);
        return;
      }
      try {
        const data = await apiFetch('/api/models/summary', { token });
        setSummary(data);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    fetchSummary();
  }, [token]);

  if (loading) {
    return <div className="max-w-3xl mx-auto py-12">Loading training artifacts...</div>;
  }

  if (error) {
    return <div className="max-w-3xl mx-auto py-12 text-red-600">{error}</div>;
  }

  const data = summary?.hasModel ? summary : initialResult;

  if (!data) {
    return <div className="max-w-3xl mx-auto py-12">No training run available.</div>;
  }

  const gradeEntries = Object.entries(data.gradePoints || {});

  return (
    <div className="max-w-5xl mx-auto py-10 space-y-6">
      <div className="bg-green-50 border border-green-200 p-6 rounded">
        <h1 className="text-3xl font-bold text-green-800">Training complete!</h1>
        <p className="text-green-700">Your model artifacts are ready. Review the metrics and plots below.</p>
      </div>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Key Metrics</h2>
        <pre className="bg-slate-900 text-green-200 text-sm p-4 rounded whitespace-pre-wrap overflow-auto">
          {JSON.stringify(data.metrics, null, 2)}
        </pre>
        {data.bestModel && (
          <div className="text-sm text-gray-600">Best model: <span className="font-medium">{data.bestModel}</span></div>
        )}
      </section>

      {gradeEntries.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-xl font-semibold">Grade Scale</h2>
          <table className="min-w-sm border text-sm">
            <thead className="bg-gray-100">
              <tr>
                <th className="border px-3 py-2 text-left">Grade</th>
                <th className="border px-3 py-2 text-left">Points</th>
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
      )}

      {(data.plots?.length || summary?.plots?.length) > 0 && (
        <section className="space-y-3">
          <h2 className="text-xl font-semibold">Training Plots</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {(summary?.plots || data.plots || []).map((plot) => (
              <img key={plot} src={plot} alt="Training plot" className="w-full border rounded" />
            ))}
          </div>
        </section>
      )}

      <div className="flex items-center justify-between">
        <Link to="/dashboard/summary" className="text-indigo-600">View Dashboard</Link>
        <Link to="/dashboard/predict" className="bg-indigo-600 text-white px-4 py-2 rounded">Go to Predictions</Link>
      </div>
    </div>
  );
}
