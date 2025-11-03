const defaultGradeScale = {
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
};

const defaults = {
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
  GRADE_POINTS: defaultGradeScale
};

const numericBounds = {
  RF_TREES: [50, 1000],
  LGBM_N_ESTIMATORS: [200, 4000],
  MLP_HIDDEN: [16, 256],
  MLP_EPOCHS: [50, 600],
  MLP_PATIENCE: [10, 100],
  TEST_SIZE: [0.1, 0.3],
  THREADS: [2, 8]
};

export function validateAndClampConfig(cfg = {}) {
  const merged = { ...defaults, ...cfg };

  for (const [field, [min, max]] of Object.entries(numericBounds)) {
    const raw = Number(merged[field]);
    const value = Number.isFinite(raw) ? raw : defaults[field];
    merged[field] = Math.min(max, Math.max(min, value));
  }

  merged.SVR_ENABLE = Boolean(merged.SVR_ENABLE);

  merged.RISK_HIGH_MAX = Number(merged.RISK_HIGH_MAX ?? defaults.RISK_HIGH_MAX);
  merged.RISK_MED_MAX = Number(merged.RISK_MED_MAX ?? defaults.RISK_MED_MAX);

  if (!Number.isFinite(merged.RISK_HIGH_MAX) || !Number.isFinite(merged.RISK_MED_MAX)) {
    throw new Error('RISK thresholds must be numeric');
  }

  if (merged.RISK_HIGH_MAX < 0 || merged.RISK_MED_MAX < 0) {
    throw new Error('Risk thresholds must be positive');
  }

  if (merged.RISK_HIGH_MAX > merged.RISK_MED_MAX) {
    throw new Error('RISK_HIGH_MAX must be less than or equal to RISK_MED_MAX');
  }

  const gpRaw = merged.GRADE_POINTS ?? defaultGradeScale;
  if (typeof gpRaw !== 'object' || Array.isArray(gpRaw)) {
    throw new Error('GRADE_POINTS must be an object with grade labels as keys');
  }

  const entries = Object.entries(gpRaw);
  if (entries.length < 1 || entries.length > 30) {
    throw new Error('GRADE_POINTS must contain between 1 and 30 entries');
  }

  const gradePoints = {};
  const seenValues = new Set();
  for (const [label, value] of entries) {
    if (typeof label !== 'string' || !label.trim()) {
      throw new Error('GRADE_POINTS keys must be non-empty strings');
    }
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric < 0 || numeric > 10) {
      throw new Error('GRADE_POINTS values must be numeric within [0,10]');
    }
    const rounded = Math.round(numeric * 100) / 100;
    gradePoints[label.trim()] = rounded;
    seenValues.add(rounded);
  }

  if (seenValues.size < 2) {
    throw new Error('GRADE_POINTS must contain at least two distinct numeric values');
  }

  merged.GRADE_POINTS = gradePoints;
  merged.MAX_GPA = Math.max(...seenValues);

  return merged;
}
