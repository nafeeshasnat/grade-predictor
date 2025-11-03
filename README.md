# Grade Predictor – Multi-tenant ML training dashboard

Production-ready Express + React application for wrapping the provided Python ML training and inference scripts.

## Tech stack

- **Backend:** Node.js (Express), Prisma ORM (SQLite), JWT auth, Multer uploads, Server-Sent Events for logs
- **Frontend:** React (JS), React Router, fetch, minimal utility classes
- **Python ML:** `ml/train.py` and `ml/predict.py` executed via `child_process.spawn`

## Getting started

```bash
# Backend
cd server
npm install
cp .env.example .env
# update .env with JWT_SECRET and DATABASE_URL (sqlite path)
npx prisma migrate dev --name init
npm run dev

# Frontend
cd ../client
npm install
npm run dev
```

The Express API listens on `http://localhost:3000` by default and serves static artifacts from `/static/*`. The React client can proxy API requests or run separately.

## Environment variables

| Variable        | Description                                            |
|-----------------|--------------------------------------------------------|
| `PORT`          | Express port (default `3000`)                          |
| `DATABASE_URL`  | Prisma connection string (e.g. `file:../storage.db`)   |
| `JWT_SECRET`    | Secret for signing authentication tokens               |
| `PYTHON_BIN`    | Optional custom python executable (defaults to `python3`)|

## Database schema (Prisma)

- `Organization(id, name, createdAt)`
- `User(id, orgId, email UNIQUE, passwordHash, createdAt)`
- `ModelRun(id, orgId, status ENUM, config JSON, metrics JSON, gradePoints JSON, plots JSON[], artifactsDir TEXT, bestModel TEXT, createdAt, finishedAt, supersededAt, @@index(orgId, createdAt DESC))`
- `Prediction(id, orgId, studentId TEXT, inputPath TEXT, results JSON, outFile TEXT, summary JSON, createdAt, @@index(orgId, createdAt DESC))`

Each row is scoped by `orgId` to enforce multi-tenancy.

## API quick reference

### Auth

```bash
# Signup
curl -X POST http://localhost:3000/api/auth/signup \
  -H 'Content-Type: application/json' \
  -d '{"orgName":"Campus A","email":"admin@campus.edu","password":"secret123"}'

# Sign in
curl -X POST http://localhost:3000/api/auth/signin \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@campus.edu","password":"secret123"}'

# Current user
curl http://localhost:3000/api/auth/me \
  -H "Authorization: Bearer <TOKEN>"
```

### Training

```bash
# Model status
curl http://localhost:3000/api/models/status -H "Authorization: Bearer <TOKEN>"

# Start training (trainJson multipart + configJson field)
curl -X POST http://localhost:3000/api/models/train \
  -H "Authorization: Bearer <TOKEN>" \
  -F "trainJson=@./ml/samples/train.sample.json" \
  -F 'configJson={"RF_TREES":300,"GRADE_POINTS":{"A":4,"B":3,"C":2,"D":1}}'

# Stream training logs (SSE)
curl http://localhost:3000/api/models/train/<RUN_ID>/logs?token=<TOKEN>

# Latest summary
curl http://localhost:3000/api/models/summary -H "Authorization: Bearer <TOKEN>"

# Retrain (identical to train)
curl -X POST http://localhost:3000/api/models/retrain \
  -H "Authorization: Bearer <TOKEN>" \
  -F "trainJson=@./ml/samples/train.sample.json" \
  -F 'configJson={"RF_TREES":400,"GRADE_POINTS":{"A":4,"B":3,"C":2,"D":1}}'
```

### Prediction

```bash
# Submit prediction (file upload)
curl -X POST http://localhost:3000/api/predict \
  -H "Authorization: Bearer <TOKEN>" \
  -F "file=@./ml/samples/predict.sample.json"

# Submit prediction (paste JSON)
curl -X POST http://localhost:3000/api/predict \
  -H "Authorization: Bearer <TOKEN>" \
  -F 'jsonText={"student_id":"S-1001","gpa":3.2}'

# Stream prediction logs (SSE)
curl http://localhost:3000/api/predict/<PREDICTION_ID>/logs?token=<TOKEN>

# List predictions
curl http://localhost:3000/api/predictions?page=1&pageSize=10 -H "Authorization: Bearer <TOKEN>"

# Prediction detail
curl http://localhost:3000/api/predictions/<PREDICTION_ID> -H "Authorization: Bearer <TOKEN>"
```

All SSE streams require the JWT appended as a `token` query parameter because custom headers are unavailable for EventSource clients.

## Frontend routes

- `/signin`, `/signup`
- `/train-model` – overview CTA
- `/train-models` – configuration form with grade-scale editor and log viewer
- `/training-complete` – metrics, plots, active grade scale
- `/dashboard/summary`, `/dashboard/predict`, `/dashboard/history`, `/dashboard/history/:id`, `/dashboard/retrain`

The React app uses `fetch` to call the API and EventSource to render live logs for training and prediction runs.

## Storage layout

- `storage/uploads/<orgId>/<timestamp>.json` – training data uploads
- `storage/models/<orgId>/<runId>/` – artifacts and logs for a training run
- `storage/predictions/<orgId>/<predictionId>.json` – prediction inputs + `.result.json` outputs + `.log`

The `/static/*` route exposes files under `storage/` for consumption by the client UI.
