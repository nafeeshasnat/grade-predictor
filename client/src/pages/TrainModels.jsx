import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import GradeScaleEditor from '../components/GradeScaleEditor.jsx';
import LogViewer from '../components/LogViewer.jsx';
import { apiFetch, createEventSource } from '../api.js';
import { useAuth } from '../AuthContext.jsx';

const CONFIG_FIELDS = [
  { key: 'RF_TREES', label: 'Random Forest Trees', min: 50, max: 1000, step: 10 },
  { key: 'LGBM_N_ESTIMATORS', label: 'LightGBM Estimators', min: 200, max: 4000, step: 50 },
  { key: 'MLP_HIDDEN', label: 'MLP Hidden Units', min: 16, max: 256, step: 8 },
  { key: 'MLP_EPOCHS', label: 'MLP Epochs', min: 50, max: 600, step: 10 },
  { key: 'MLP_PATIENCE', label: 'MLP Patience', min: 10, max: 100, step: 5 },
  { key: 'TEST_SIZE', label: 'Test Size', min: 0.1, max: 0.3, step: 0.01, type: 'float' },
  { key: 'THREADS', label: 'Training Threads', min: 2, max: 8, step: 1 }
];

const DEFAULT_CONFIG = {
  RF_TREES: 300,
  LGBM_N_ESTIMATORS: 2000,
  MLP_HIDDEN: 64,
  MLP_EPOCHS: 300,
  MLP_PATIENCE: 40,
  TEST_SIZE: 0.2,
  THREADS: 4,
  SVR_ENABLE: true,
  RISK_HIGH_MAX: 3.3,
  RISK_MED_MAX: 3.5,
  GRADE_POINTS: {
    'A+': 4.0,
    'A': 3.75,
    'A-': 3.5,
    'B+': 3.25,
    'B': 3.0,
    'B-': 2.75,
    'C+': 2.5,
    'C': 2.25,
    'D': 2.0,
    'F': 0.0
  }
};

export default function TrainModels({ mode = 'train' }) {
  const navigate = useNavigate();
  const { token } = useAuth();
  const [config, setConfig] = useState(DEFAULT_CONFIG);
  const [gradePoints, setGradePoints] = useState(DEFAULT_CONFIG.GRADE_POINTS);
  const [file, setFile] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [logs, setLogs] = useState('');
  const [runId, setRunId] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function loadLatestGradeScale() {
      try {
        const summary = await apiFetch('/api/models/summary', { token });
        if (summary?.gradePoints) {
          setGradePoints(summary.gradePoints);
          setConfig((prev) => ({ ...prev, GRADE_POINTS: summary.gradePoints }));
        }
      } catch (err) {
        console.warn('No existing summary yet', err);
      }
    }
    if (token) {
      loadLatestGradeScale();
    }
  }, [token]);

  useEffect(() => {
    setConfig((prev) => ({ ...prev, GRADE_POINTS: gradePoints }));
  }, [gradePoints]);

  useEffect(() => {
    let source;
    if (runId && token) {
      source = createEventSource(`/api/models/train/${runId}/logs`, token);
      source.onmessage = (event) => {
        if (!event.data) return;
        setLogs((prev) => `${prev}${event.data}\n`);
        if (event.data.includes('__RESULT__')) {
          try {
            const payload = JSON.parse(event.data.replace('__RESULT__', ''));
          setResult(payload);
        } catch (err) {
          console.error('Failed to parse training result', err);
        }
        }
      };
      source.onerror = () => {
        source.close();
      };
    }
    return () => {
      if (source) source.close();
    };
  }, [runId, token]);

  useEffect(() => {
    if (result && result.status === 'ok') {
      const timeout = setTimeout(() => {
        navigate('/training-complete', { replace: true, state: { runId, result } });
      }, 1500);
      return () => clearTimeout(timeout);
    }
    if (result && result.status !== 'ok') {
      setError('Training failed. Check logs for details.');
    }
  }, [result, navigate, runId]);

  const handleFieldChange = (key, value) => {
    setConfig((prev) => ({ ...prev, [key]: value }));
  };

  const validateGradePoints = (points) => {
    const entries = Object.entries(points || {});
    if (entries.length < 2) {
      throw new Error('Grade scale must contain at least two rows');
    }
    if (entries.length > 30) {
      throw new Error('Grade scale must contain no more than 30 rows');
    }
    const numericValues = entries.map(([, val]) => Number(val));
    if (numericValues.some((val) => Number.isNaN(val) || val < 0 || val > 10)) {
      throw new Error('Grade points must be numbers between 0 and 10');
    }
    if (new Set(numericValues).size < 2) {
      throw new Error('Provide at least two distinct grade point values');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!file) {
      setError('Upload a training JSON file first.');
      return;
    }
    try {
      validateGradePoints(gradePoints);
    } catch (err) {
      setError(err.message);
      return;
    }

    setSubmitting(true);
    setLogs('');
    setError(null);

    const payload = { ...config, GRADE_POINTS: gradePoints };
    if (Number(payload.RISK_HIGH_MAX) > Number(payload.RISK_MED_MAX)) {
      setSubmitting(false);
      setError('High risk threshold must be less than or equal to medium risk threshold.');
      return;
    }
    const formData = new FormData();
    formData.append('configJson', JSON.stringify(payload));
    formData.append('trainJson', file);

    try {
      const endpoint = mode === 'retrain' ? '/api/models/retrain' : '/api/models/train';
      const data = await apiFetch(endpoint, { method: 'POST', body: formData, token });
      setRunId(data.runId);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const formTitle = useMemo(() => (mode === 'retrain' ? 'Retrain Model' : 'Initial Training'), [mode]);

  return (
    <div className="max-w-5xl mx-auto py-10 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">{formTitle}</h1>
        <p className="text-gray-600">Tune the configuration, upload your dataset, and watch logs in real time.</p>
      </div>
      <form className="grid grid-cols-1 md:grid-cols-2 gap-6" onSubmit={handleSubmit}>
        <section className="space-y-4">
          <h2 className="text-xl font-semibold">Hyperparameters</h2>
          {CONFIG_FIELDS.map((field) => (
            <div key={field.key} className="flex flex-col">
              <label className="text-sm font-medium mb-1">
                {field.label}
                <span className="text-xs text-gray-500 ml-2">[{field.min} - {field.max}]</span>
              </label>
              <input
                type="number"
                min={field.min}
                max={field.max}
                step={field.step}
                value={config[field.key] ?? ''}
                onChange={(e) => {
                  const raw = e.target.value;
                  const numeric = field.type === 'float' ? parseFloat(raw) : parseInt(raw, 10);
                  handleFieldChange(field.key, Number.isNaN(numeric) ? field.min : numeric);
                }}
                className="border rounded px-3 py-2"
                required={!field.optional}
              />
            </div>
          ))}
          <div className="flex items-center space-x-3">
            <input
              type="checkbox"
              id="svr"
              checked={Boolean(config.SVR_ENABLE)}
              onChange={(e) => handleFieldChange('SVR_ENABLE', e.target.checked)}
            />
            <label htmlFor="svr" className="text-sm font-medium">Enable SVR blending</label>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium mb-1">High Risk Max (≤ Medium)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                max="10"
                value={config.RISK_HIGH_MAX}
                onChange={(e) => handleFieldChange('RISK_HIGH_MAX', parseFloat(e.target.value))}
                className="border rounded px-3 py-2"
                required
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1">Medium Risk Max</label>
              <input
                type="number"
                step="0.01"
                min="0"
                max="10"
                value={config.RISK_MED_MAX}
                onChange={(e) => handleFieldChange('RISK_MED_MAX', parseFloat(e.target.value))}
                className="border rounded px-3 py-2"
                required
              />
            </div>
          </div>
        </section>
        <section className="space-y-4">
          <GradeScaleEditor value={gradePoints} onChange={setGradePoints} disabled={submitting} />
          <div>
            <label className="text-sm font-medium mb-1">Training Dataset (JSON)</label>
            <input
              type="file"
              accept="application/json"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              disabled={submitting}
              className="border rounded px-3 py-2 w-full"
            />
          </div>
          <button
            type="submit"
            disabled={submitting || !token}
            className="w-full bg-green-600 text-white py-2 rounded hover:bg-green-700 disabled:opacity-50"
          >
            {submitting ? 'Submitting...' : mode === 'retrain' ? 'Start Retraining' : 'Start Training'}
          </button>
          {error && <div className="text-red-600 text-sm">{error}</div>}
        </section>
      </form>
      {runId && (
        <div className="space-y-4">
          <h2 className="text-xl font-semibold">Run {runId}</h2>
          <LogViewer logs={logs} />
        </div>
      )}
    </div>
  );
}
