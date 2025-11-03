import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../api.js';
import { useAuth } from '../AuthContext.jsx';

export default function DashboardHistory() {
  const { token } = useAuth();
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [data, setData] = useState({ items: [], total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function fetchHistory() {
      if (!token) return;
      setLoading(true);
      try {
        const response = await apiFetch(`/api/predictions?page=${page}&pageSize=${pageSize}`, { token });
        setData(response);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    fetchHistory();
  }, [token, page, pageSize]);

  const totalPages = Math.max(1, Math.ceil(data.total / pageSize));

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">Prediction History</h2>
      {loading ? (
        <div>Loading predictions...</div>
      ) : error ? (
        <div className="text-red-600">{error}</div>
      ) : data.items.length === 0 ? (
        <div>No predictions recorded yet.</div>
      ) : (
        <table className="w-full text-sm border">
          <thead className="bg-gray-100">
            <tr>
              <th className="border px-3 py-2 text-left">ID</th>
              <th className="border px-3 py-2 text-left">Student</th>
              <th className="border px-3 py-2 text-left">Created</th>
              <th className="border px-3 py-2 text-left">Risk</th>
              <th className="border px-3 py-2 text-left"></th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((item) => (
              <tr key={item.id}>
                <td className="border px-3 py-2 font-mono text-xs">{item.id}</td>
                <td className="border px-3 py-2">{item.studentId}</td>
                <td className="border px-3 py-2">{new Date(item.createdAt).toLocaleString()}</td>
                <td className="border px-3 py-2">{item.summary?.risk || '—'}</td>
                <td className="border px-3 py-2 text-right">
                  <Link className="text-indigo-600" to={`/dashboard/history/${item.id}`}>View</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div className="flex items-center justify-between">
        <button
          className="px-3 py-1 border rounded disabled:opacity-50"
          onClick={() => setPage((p) => Math.max(1, p - 1))}
          disabled={page <= 1}
        >
          Previous
        </button>
        <div className="text-sm text-gray-600">
          Page {page} of {totalPages}
        </div>
        <button
          className="px-3 py-1 border rounded disabled:opacity-50"
          onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          disabled={page >= totalPages}
        >
          Next
        </button>
      </div>
    </div>
  );
}
