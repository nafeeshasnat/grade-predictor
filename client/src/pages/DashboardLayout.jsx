import React, { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { apiFetch } from '../api.js';
import { useAuth } from '../AuthContext.jsx';

export default function DashboardLayout() {
  const { token, org, signout } = useAuth();
  const [status, setStatus] = useState({ hasModel: false, lastRun: null });
  const [loading, setLoading] = useState(true);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    async function fetchStatus() {
      if (!token) return;
      try {
        const data = await apiFetch('/api/models/status', { token });
        setStatus(data);
        if (!data.hasModel && !location.pathname.includes('/train')) {
          navigate('/train-model', { replace: true });
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    fetchStatus();
  }, [token, location.pathname, navigate]);

  const navClass = ({ isActive }) =>
    `px-3 py-2 rounded ${isActive ? 'bg-indigo-600 text-white' : 'text-gray-700 hover:bg-gray-200'}`;

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="bg-white shadow">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">{org?.name || 'Dashboard'}</h1>
            <p className="text-sm text-gray-600">AI-powered grade predictions for your organization</p>
          </div>
          <div className="flex items-center space-x-4">
            {status.hasModel ? (
              <span className="text-sm text-green-700 font-medium">Model ready</span>
            ) : (
              <Link to="/train-models" className="text-sm text-indigo-600">
                Train a model
              </Link>
            )}
            <button onClick={signout} className="text-sm text-red-600">Sign out</button>
          </div>
        </div>
      </header>
      <div className="max-w-6xl mx-auto px-6 py-8">
        <nav className="flex space-x-4 mb-6">
          <NavLink to="/dashboard/summary" className={navClass} end>Summary</NavLink>
          <NavLink to="/dashboard/predict" className={navClass}>Predict</NavLink>
          <NavLink to="/dashboard/history" className={navClass}>History</NavLink>
          <NavLink to="/dashboard/retrain" className={navClass}>Retrain</NavLink>
        </nav>
        {loading ? <div>Loading dashboard...</div> : <Outlet context={{ status }} />}
      </div>
    </div>
  );
}
