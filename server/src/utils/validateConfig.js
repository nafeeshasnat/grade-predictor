export function validateAndClampConfig(cfg = {}) {
  const defaults = {
    RF_TREES: 300, LGBM_N_ESTIMATORS: 2000, MLP_HIDDEN: 64,
    MLP_EPOCHS: 300, MLP_PATIENCE: 40, TEST_SIZE: 0.2, THREADS: 4,
    SVR_ENABLE: true, RISK_HIGH_MAX: 3.30, RISK_MED_MAX: 3.50,
    GRADE_POINTS: {
      "A+":4.0,"A":3.75,"A-":3.5,"B+":3.25,"B":3.0,"B-":2.75,"C+":2.5,"C":2.25,"D":2.0,"F":0.0
    }
  };
  const bounds = {
    RF_TREES: [50, 1000], LGBM_N_ESTIMATORS: [200, 4000],
    MLP_HIDDEN: [16, 256], MLP_EPOCHS: [50, 600],
    MLP_PATIENCE: [10, 100], TEST_SIZE: [0.1, 0.3], THREADS: [1, 16]
  };
  const out = { ...defaults, ...cfg };
  for (const [k, [lo, hi]] of Object.entries(bounds)) {
    const v = Number(out[k]);
    out[k] = Math.min(hi, Math.max(lo, isNaN(v) ? defaults[k] : v));
  }
  out.SVR_ENABLE = Boolean(out.SVR_ENABLE);
  if (out.RISK_HIGH_MAX > out.RISK_MED_MAX) throw new Error('RISK_HIGH_MAX must be <= RISK_MED_MAX');
  const gp = out.GRADE_POINTS;
  if (typeof gp !== 'object') throw new Error('GRADE_POINTS must be an object');
  const vals = Object.values(gp).map(Number);
  if (vals.some(v => Number.isNaN(v) || v < 0 || v > 10)) throw new Error('GRADE_POINTS values must be within [0,10]');
  return out;
}
