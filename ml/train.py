#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import argparse, os, sys, json, time, math, datetime
from pathlib import Path
import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
import seaborn as sns

# ---------- Config bounds ----------
BOUNDS = {
    "RF_TREES": (50, 1000),
    "LGBM_N_ESTIMATORS": (200, 4000),
    "MLP_HIDDEN": (16, 256),
    "MLP_EPOCHS": (50, 600),
    "MLP_PATIENCE": (10, 100),
    "TEST_SIZE": (0.10, 0.30),
    "THREADS": (2, 8),
}

# ------------------------- GPA helpers (from config) ------------------------
def validate_grade_points(grade_points: dict):
    if not isinstance(grade_points, dict) or len(grade_points) < 2 or len(grade_points) > 30:
        raise ValueError("GRADE_POINTS must be an object with 2..30 entries")
    vals = []
    for k, v in grade_points.items():
        if not isinstance(k, str): raise ValueError("GRADE_POINTS keys must be strings")
        if not (isinstance(v, int) or isinstance(v, float)): raise ValueError("GRADE_POINTS values must be numbers")
        if v < 0 or v > 10: raise ValueError("GRADE_POINTS values must be within [0,10]")
        vals.append(float(v))
    return float(max(vals))

def semester_gpa(sem, GP):
    pts = []
    for k, g in sem.items():
        if k == "attendancePercentage": 
            continue
        if g in GP:
            pts.append(GP[g])
    return float(np.mean(pts)) if pts else None

def cumulative_cgpa(semesters, GP):
    tot, cnt = 0.0, 0
    for sem in semesters.values():
        for k, g in sem.items():
            if k == "attendancePercentage": continue
            if g in GP:
                tot += GP[g]; cnt += 1
    return (tot/cnt) if cnt>0 else None

def build_features_for_final(student, GP):
    semesters = student.get("semesters", {})
    if not semesters: return None, None
    sem_nums = sorted(map(int, semesters.keys()))
    if len(sem_nums) < 2: return None, None
    y = cumulative_cgpa(semesters, GP)
    if y is None: return None, None
    upto = sem_nums[-2]
    att, sem_gpas, loads = [], [], []
    for s in sem_nums:
        if s <= upto:
            sem = semesters[str(s)]
            if "attendancePercentage" in sem: att.append(sem["attendancePercentage"])
            g = semester_gpa(sem, GP)
            if g is not None: sem_gpas.append(g)
            loads.append(sum(1 for k in sem if k!="attendancePercentage"))
    avg_att = float(np.mean(att)) if att else 0.0
    gpa_trend = (sem_gpas[-1]-sem_gpas[-2]) if len(sem_gpas)>=2 else 0.0
    avg_load = float(np.mean(loads)) if loads else 0.0
    X = [
        float(student.get("ssc_gpa", 0.0)),
        float(student.get("hsc_gpa", 0.0)),
        1 if str(student.get("gender","")).lower()=="female" else 0,
        int(student.get("birth_year", 0)),
        avg_att, gpa_trend, avg_load
    ]
    return X, float(y)

def build_features_for_next(student, GP):
    semesters = student.get("semesters", {})
    if not semesters: return None
    sem_nums = sorted(map(int, semesters.keys()))
    att, sem_gpas, loads = [], [], []
    for s in sem_nums:
        sem = semesters[str(s)]
        if "attendancePercentage" in sem: att.append(sem["attendancePercentage"])
        g = semester_gpa(sem, GP)
        if g is not None: sem_gpas.append(g)
        loads.append(sum(1 for k in sem if k!="attendancePercentage"))
    avg_att = float(np.mean(att)) if att else 0.0
    gpa_trend = (sem_gpas[-1]-sem_gpas[-2]) if len(sem_gpas)>=2 else 0.0
    avg_load = float(np.mean(loads)) if loads else 0.0
    X = [
        float(student.get("ssc_gpa", 0.0)),
        float(student.get("hsc_gpa", 0.0)),
        1 if str(student.get("gender","")).lower()=="female" else 0,
        int(student.get("birth_year", 0)),
        avg_att, gpa_trend, avg_load
    ]
    return X

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--org-id", required=True)
    ap.add_argument("--train-json", required=True)
    ap.add_argument("--config-json", required=True)
    ap.add_argument("--out-dir", required=True)
    args = ap.parse_args()

    org_id = args.org_id
    out_dir = Path(args.out_dir); plots_dir = out_dir/"plots"
    out_dir.mkdir(parents=True, exist_ok=True); plots_dir.mkdir(parents=True, exist_ok=True)

    # Load config & clamp bounds
    cfg = json.load(open(args.config_json))
    def clamp(name, default):
        lo, hi = BOUNDS[name]
        val = cfg.get(name, default)
        return max(lo, min(hi, val))
    RANDOM_SEED = int(cfg.get("RANDOM_SEED", 42))
    TEST_SIZE   = float(clamp("TEST_SIZE", 0.20))
    THREADS     = int(clamp("THREADS", 4))
    RF_TREES    = int(clamp("RF_TREES", 300))
    LGBM_N_EST  = int(clamp("LGBM_N_ESTIMATORS", 2000))
    MLP_HIDDEN  = int(clamp("MLP_HIDDEN", 64))
    MLP_EPOCHS  = int(clamp("MLP_EPOCHS", 300))
    MLP_PATIENCE= int(clamp("MLP_PATIENCE", 40))
    SVR_ENABLE  = bool(cfg.get("SVR_ENABLE", True))
    RISK_HIGH_MAX = float(cfg.get("RISK_HIGH_MAX", 3.30))
    RISK_MED_MAX  = float(cfg.get("RISK_MED_MAX", 3.50))
    GRADE_POINTS = cfg.get("GRADE_POINTS", {
        "A+":4.0,"A":3.75,"A-":3.5,"B+":3.25,"B":3.0,"B-":2.75,"C+":2.5,"C":2.25,"D":2.0,"F":0.0
    })
    max_gpa = validate_grade_points(GRADE_POINTS)

    os.environ.setdefault("OMP_NUM_THREADS", str(THREADS))
    try:
        import torch; torch.set_num_threads(THREADS)
    except Exception: pass

    # Load data
    train_path = args.train_json
    assert os.path.exists(train_path), f"Training file not found: {train_path}"
    data = json.load(open(train_path))
    print(f"[INFO] org={org_id} students={len(data)} max_gpa={max_gpa}")

    # Build datasets
    X_final, y_final, X_next, y_next = [], [], [], []
    t0 = time.perf_counter()
    for i, stu in enumerate(data):
        if i and i % 1000 == 0: print(f"[INFO] features {i}/{len(data)}")
        xf, yf = build_features_for_final(stu, GRADE_POINTS)
        if xf is not None and yf is not None:
            X_final.append(xf); y_final.append(yf)
        sems = stu.get("semesters", {})
        sem_nums = sorted(map(int, sems.keys()))
        for j in range(len(sem_nums)-1):
            upto = sem_nums[j]
            truncated = {k: v for k, v in sems.items() if int(k) <= upto}
            Xn = build_features_for_next({
                "ssc_gpa": stu["ssc_gpa"], "hsc_gpa": stu["hsc_gpa"],
                "gender": stu["gender"], "birth_year": stu["birth_year"],
                "semesters": truncated
            }, GRADE_POINTS)
            next_g = semester_gpa(sems[str(sem_nums[j+1])], GRADE_POINTS)
            if Xn is not None and next_g is not None:
                X_next.append(Xn); y_next.append(next_g)
    import time as _time
    X_final = np.array(X_final, float); y_final = np.array(y_final, float)
    X_next  = np.array(X_next,  float); y_next  = np.array(y_next,  float)
    print(f"[INFO] features built in {_time.perf_counter()-t0:.2f}s")
    print(f"[INFO] FinalCGPA: X={X_final.shape} y={y_final.shape} | NextGPA: X={X_next.shape} y={y_next.shape}")

    # Clip to dynamic max GPA
    if X_final.size: X_final[:,4] = np.clip(X_final[:,4], 0, 100)
    if X_next.size:  X_next[:,4]  = np.clip(X_next[:,4], 0, 100)
    y_final = np.clip(y_final, 0, max_gpa)
    y_next  = np.clip(y_next,  0, max_gpa)

    # Split
    from sklearn.model_selection import train_test_split
    Xf_tr, Xf_te, yf_tr, yf_te = train_test_split(X_final, y_final, test_size=TEST_SIZE, random_state=RANDOM_SEED)

    # Models
    from sklearn.tree import DecisionTreeRegressor
    from sklearn.ensemble import RandomForestRegressor
    from sklearn.svm import SVR
    from sklearn.pipeline import make_pipeline
    from sklearn.preprocessing import StandardScaler
    from sklearn.metrics import mean_absolute_error, mean_squared_error

    def rmse(y_true, y_pred):
        from math import sqrt
        return sqrt(mean_squared_error(y_true, y_pred))

    dt = DecisionTreeRegressor(max_depth=12, min_samples_leaf=10, random_state=RANDOM_SEED)
    rf = RandomForestRegressor(
        n_estimators=RF_TREES, max_features="sqrt", min_samples_leaf=5, n_jobs=-1,
        random_state=RANDOM_SEED, oob_score=True, bootstrap=True
    )
    svr = make_pipeline(StandardScaler(), SVR(kernel="rbf", C=2.0, epsilon=0.1))

    import lightgbm as lgb
    lgbm = lgb.LGBMRegressor(
        n_estimators=LGBM_N_EST, learning_rate=0.03, num_leaves=35,
        subsample=0.8, colsample_bytree=0.8, min_child_samples=25,
        reg_lambda=0.1, random_state=RANDOM_SEED, n_jobs=-1, force_col_wise=True
    )

    # MLP
    import torch, torch.nn as nn
    class MLP(nn.Module):
        def __init__(self, in_dim, hid=64):
            super().__init__()
            self.net = nn.Sequential(
                nn.Linear(in_dim, hid), nn.ReLU(),
                nn.Linear(hid, hid), nn.ReLU(),
                nn.Linear(hid, 1)
            )
        def forward(self, x): return self.net(x)

    # Train LGBM (with eval curve)
    from sklearn.model_selection import train_test_split as _tts
    Xtr_lgb, Xval_lgb, ytr_lgb, yval_lgb = _tts(Xf_tr, yf_tr, test_size=0.2, random_state=RANDOM_SEED)
    evals_result = {}
    lgbm.fit(
        Xtr_lgb, ytr_lgb,
        eval_set=[(Xval_lgb, yval_lgb)],
        eval_metric="rmse",
        callbacks=[lgb.early_stopping(stopping_rounds=100, verbose=True),
                   lgb.record_evaluation(evals_result)]
    )
    print(f"[INFO] LGBM best_iteration={lgbm.best_iteration_}")

    # Train MLP
    def train_mlp(Xtr, ytr, Xval, yval, epochs=300, lr=1e-3, patience=40, hid=64):
        scaler = StandardScaler().fit(Xtr)
        Xtr_s = scaler.transform(Xtr); Xval_s = scaler.transform(Xval)
        xt = torch.tensor(Xtr_s, dtype=torch.float32)
        yt = torch.tensor(ytr.reshape(-1,1), dtype=torch.float32)
        xv = torch.tensor(Xval_s, dtype=torch.float32)
        yv = torch.tensor(yval.reshape(-1,1), dtype=torch.float32)
        model = MLP(in_dim=xt.shape[1], hid=hid)
        opt = torch.optim.Adam(model.parameters(), lr=lr)
        loss_fn = nn.MSELoss()
        best_state, best = None, float("inf"); stale=0
        hist = []
        for ep in range(1, epochs+1):
            model.train(); opt.zero_grad()
            pred = model(xt); loss = loss_fn(pred, yt); loss.backward(); opt.step()
            model.eval()
            with torch.no_grad():
                vpred = model(xv); vloss = loss_fn(vpred, yv).item()
            hist.append(vloss**0.5)
            if vloss < best - 1e-5: best, best_state, stale = vloss, model.state_dict(), 0
            else: stale += 1
            if ep % 20 == 0: print(f"[MLP] epoch {ep} val_RMSE={vloss**0.5:.4f}")
            if stale >= patience: print(f"[MLP] early stop @ {ep}"); break
        model.load_state_dict(best_state)
        return model, scaler, hist

    Xtr_mlp, Xval_mlp, ytr_mlp, yval_mlp = _tts(Xf_tr, yf_tr, test_size=0.2, random_state=RANDOM_SEED)
    mlp_model, mlp_scaler, mlp_hist = train_mlp(
        Xtr_mlp, ytr_mlp, Xval_mlp, yval_mlp,
        epochs=MLP_EPOCHS, patience=MLP_PATIENCE, hid=MLP_HIDDEN
    )

    # Train DT / RF / SVR
    dt.fit(Xf_tr, yf_tr)
    rf.fit(Xf_tr, yf_tr)
    if SVR_ENABLE:
        svr.fit(Xf_tr, yf_tr)

    # Evaluate & rank
    results = []
    def add_result(name, yhat):
        results.append((name, {"MAE": float(np.mean(np.abs(yf_te - yhat))),
                               "RMSE": float(math.sqrt(np.mean((yf_te - yhat)**2)))}))
    yhat_dt  = dt.predict(Xf_te);   add_result("DecisionTree", yhat_dt)
    yhat_rf  = rf.predict(Xf_te);   add_result("RandomForest", yhat_rf)
    yhat_lgb = lgbm.predict(Xf_te, num_iteration=lgbm.best_iteration_); add_result("LightGBM", yhat_lgb)
    with torch.no_grad():
        Xte_s = mlp_scaler.transform(Xf_te)
        yhat_mlp = mlp_model(torch.tensor(Xte_s, dtype=torch.float32)).numpy().reshape(-1)
    add_result("MLP", yhat_mlp)
    if SVR_ENABLE:
        yhat_svr = svr.predict(Xf_te); add_result("SVR", yhat_svr)
    rank_df = pd.DataFrame([{"Model": m, **metrics} for m, metrics in results]).sort_values("RMSE").reset_index(drop=True)
    print(rank_df)

    # Plots
    plots = []
    plt.figure(figsize=(6,4)); plt.plot(evals_result['valid_0']['rmse'])
    plt.title("LGBM Validation RMSE"); plt.xlabel("Iteration"); plt.ylabel("RMSE"); plt.tight_layout()
    p = plots_dir/"lgbm_val_rmse.png"; plt.savefig(p); plots.append(str(p)); plt.close()

    plt.figure(figsize=(6,4)); plt.plot(mlp_hist)
    plt.title("MLP Validation RMSE"); plt.xlabel("Epoch"); plt.ylabel("RMSE"); plt.tight_layout()
    p = plots_dir/"mlp_val_rmse.png"; plt.savefig(p); plots.append(str(p)); plt.close()

    best_name = rank_df.iloc[0]["Model"]
    yhat_map = {"DecisionTree": yhat_dt, "RandomForest": yhat_rf, "LightGBM": yhat_lgb, "MLP": yhat_mlp}
    if SVR_ENABLE: yhat_map["SVR"] = yhat_svr
    resid = yf_te - yhat_map[best_name]
    fig, ax = plt.subplots(1,2, figsize=(10,4))
    ax[0].scatter(yhat_map[best_name], resid, alpha=0.5); ax[0].axhline(0, color='k', lw=1)
    ax[0].set_title(f"{best_name}: Residuals vs Prediction"); ax[0].set_xlabel("Predicted"); ax[0].set_ylabel("Residual")
    sns.histplot(resid, kde=True, ax=ax[1]); ax[1].set_title(f"{best_name}: Residual Distribution")
    plt.tight_layout(); p = plots_dir/"best_model_residuals.png"; plt.savefig(p); plots.append(str(p)); plt.close(fig)

    feat_names = ["ssc_gpa","hsc_gpa","gender_bin","birth_year","avg_attendance","gpa_trend","avg_course_load"]
    imp = pd.Series(rf.feature_importances_, index=feat_names).sort_values(ascending=False)
    plt.figure(figsize=(6,4)); sns.barplot(x=imp.values, y=imp.index)
    plt.title("RF Feature Importance"); plt.tight_layout(); p = plots_dir/"rf_importance.png"; plt.savefig(p); plots.append(str(p)); plt.close()

    imp_lgb = pd.Series(lgbm.feature_importances_, index=feat_names).sort_values(ascending=False)
    plt.figure(figsize=(6,4)); sns.barplot(x=imp_lgb.values, y=imp_lgb.index)
    plt.title("LGBM Feature Importance"); plt.tight_layout(); p = plots_dir/"lgbm_importance.png"; plt.savefig(p); plots.append(str(p)); plt.close()

    # Risk classifier (SMOTE + RF)
    def label_risk(cgpa):
        if cgpa <= RISK_HIGH_MAX: return "High"
        elif cgpa <= RISK_MED_MAX: return "Medium"
        return "Low"
    risk_y = np.array([label_risk(v) for v in y_final])
    from sklearn.model_selection import train_test_split as _tts2
    Xc_tr, Xc_te, yc_tr, yc_te = _tts2(X_final, risk_y, test_size=TEST_SIZE, random_state=RANDOM_SEED, stratify=risk_y)
    from imblearn.over_sampling import SMOTE
    sm = SMOTE(random_state=RANDOM_SEED)
    Xc_tr_res, yc_tr_res = sm.fit_resample(Xc_tr, yc_tr)
    from sklearn.ensemble import RandomForestClassifier
    from sklearn.metrics import classification_report, ConfusionMatrixDisplay
    risk_clf = RandomForestClassifier(n_estimators=250, random_state=RANDOM_SEED, n_jobs=-1)
    risk_clf.fit(Xc_tr_res, yc_tr_res)
    print("Risk classification report:\n", classification_report(yc_te, risk_clf.predict(Xc_te)))
    fig, ax = plt.subplots(figsize=(4,4))
    ConfusionMatrixDisplay.from_estimator(risk_clf, Xc_te, yc_te, ax=ax)
    ax.set_title("Risk Classifier — Confusion Matrix"); plt.tight_layout()
    p = plots_dir/"risk_confusion_matrix.png"; plt.savefig(p); plots.append(str(p)); plt.close(fig)

    # Save artifacts
    import joblib, torch
    joblib.dump(dt,    out_dir/"DecisionTree.joblib")
    joblib.dump(rf,    out_dir/"RandomForest.joblib")
    if SVR_ENABLE: joblib.dump(svr, out_dir/"SVR.joblib")
    joblib.dump(lgbm,  out_dir/"LightGBM.joblib")
    torch.save(mlp_model.state_dict(), out_dir/"MLP.pt")
    joblib.dump(mlp_scaler, out_dir/"MLP_Scaler.joblib")
    joblib.dump(risk_clf, out_dir/"RiskClassifier.joblib")

    meta = {
        "created_at": datetime.datetime.utcnow().isoformat()+"Z",
        "feature_order": feat_names,
        "grade_points": GRADE_POINTS,           # <--- persisted scale
        "max_gpa": max_gpa,
        "random_seed": RANDOM_SEED,
        "ranking": rank_df.to_dict(orient="records"),
        "best_model": rank_df.iloc[0]["Model"],
        "org_id": org_id
    }
    with open(out_dir/"metadata.json","w") as f: json.dump(meta, f, indent=2)
    with open(out_dir/"best_model.txt","w") as f: f.write(str(rank_df.iloc[0]["Model"]))
    hist_path = out_dir/"analysis_history.json"
    if not hist_path.exists():
        with open(hist_path,"w") as f: json.dump([], f)

    result = {
        "status": "ok",
        "metrics": rank_df.to_dict(orient="records"),
        "bestModel": meta["best_model"],
        "artifactsDir": str(out_dir),
        "plots": [str(p) for p in plots],
        "gradePoints": GRADE_POINTS
    }
    print("__RESULT__" + json.dumps(result))
    return 0

if __name__ == "__main__":
    try:
        import time; sys.exit(main())
    except Exception as e:
        print(f"[ERROR] {e}", file=sys.stderr)
        print("__RESULT__" + json.dumps({"status":"error","error":str(e)}))
        sys.exit(1)