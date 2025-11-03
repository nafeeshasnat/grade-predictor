import React from 'react';

const defaultEntries = [
  ['A+', 4.0],
  ['A', 3.75],
  ['A-', 3.5],
  ['B+', 3.25],
  ['B', 3.0],
  ['B-', 2.75],
  ['C+', 2.5],
  ['C', 2.25],
  ['D', 2.0],
  ['F', 0.0]
];

export default function GradeScaleEditor({ value, onChange, disabled = false }) {
  const entries = value && Object.keys(value).length ? Object.entries(value) : defaultEntries;

  const handleChange = (index, key, val) => {
    const next = entries.map(([label, points], idx) => {
      if (idx !== index) return [label, points];
      if (key === 'label') {
        return [val, points];
      }
      const numeric = val === '' ? '' : Number(val);
      return [label, Number.isFinite(numeric) ? numeric : points];
    });
    commit(next);
  };

  const handleAdd = () => {
    if (entries.length >= 30) return;
    commit([...entries, [`New${entries.length + 1}`, 0]]);
  };

  const handleRemove = (index) => {
    if (entries.length <= 2) return;
    const next = entries.filter((_, idx) => idx !== index);
    commit(next);
  };

  const commit = (list) => {
    const normalized = {};
    list.forEach(([label, points]) => {
      if (!label) return;
      normalized[label] = points;
    });
    onChange(normalized);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-lg">Grade Scale</h3>
        <button type="button" onClick={handleAdd} disabled={disabled || entries.length >= 30} className="px-3 py-1 border rounded disabled:opacity-50">
          Add Grade
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full border text-sm">
          <thead className="bg-gray-100">
            <tr>
              <th className="border px-3 py-2 text-left">Label</th>
              <th className="border px-3 py-2 text-left">Points</th>
              <th className="border px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {entries.map(([label, points], index) => (
              <tr key={`${label}-${index}`}>
                <td className="border px-2 py-1">
                  <input
                    type="text"
                    value={label}
                    disabled={disabled}
                    onChange={(e) => handleChange(index, 'label', e.target.value)}
                    className="w-full border px-2 py-1"
                  />
                </td>
                <td className="border px-2 py-1">
                  <input
                    type="number"
                    min="0"
                    max="10"
                    step="0.01"
                    value={points}
                    disabled={disabled}
                    onChange={(e) => handleChange(index, 'points', e.target.value)}
                    className="w-full border px-2 py-1"
                  />
                </td>
                <td className="border px-2 py-1 text-center">
                  <button
                    type="button"
                    onClick={() => handleRemove(index)}
                    disabled={disabled || entries.length <= 2}
                    className="text-red-600 disabled:opacity-40"
                  >
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-gray-600">Provide between 2 and 30 grades with point values between 0 and 10.</p>
    </div>
  );
}
