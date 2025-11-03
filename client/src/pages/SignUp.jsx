import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthContext.jsx';

export default function SignUp() {
  const navigate = useNavigate();
  const { signup, setError, error } = useAuth();
  const [form, setForm] = useState({ orgName: '', email: '', password: '' });
  const [loading, setLoading] = useState(false);
  const [localError, setLocalError] = useState(null);

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setLocalError(null);
    setError(null);
    try {
      await signup(form);
      navigate('/train-model', { replace: true });
    } catch (err) {
      setLocalError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100">
      <div className="bg-white shadow-md rounded-md p-8 w-full max-w-md space-y-4">
        <h1 className="text-2xl font-bold text-center">Create Organization</h1>
        <p className="text-sm text-gray-600 text-center">Set up your multi-tenant workspace</p>
        {(localError || error) && (
          <div className="text-red-600 text-sm text-center">{localError || error}</div>
        )}
        <form className="space-y-3" onSubmit={handleSubmit}>
          <div>
            <label className="block text-sm font-medium mb-1">Organization Name</label>
            <input
              type="text"
              name="orgName"
              value={form.orgName}
              onChange={handleChange}
              required
              className="w-full border rounded px-3 py-2"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Email</label>
            <input
              type="email"
              name="email"
              value={form.email}
              onChange={handleChange}
              required
              className="w-full border rounded px-3 py-2"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Password</label>
            <input
              type="password"
              name="password"
              value={form.password}
              onChange={handleChange}
              required
              className="w-full border rounded px-3 py-2"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-indigo-600 text-white py-2 rounded hover:bg-indigo-700 disabled:opacity-50"
          >
            {loading ? 'Creating...' : 'Create Account'}
          </button>
        </form>
        <p className="text-sm text-center text-gray-600">
          Already have access? <Link className="text-indigo-600" to="/signin">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
