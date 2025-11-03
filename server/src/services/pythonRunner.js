import { spawn } from 'child_process';
import path from 'path';

export function spawnTrain({ orgId, trainJson, configJson, outDir, onData, onEnd }) {
  const PY = process.env.PYTHON_BIN || 'python3';
  const args = [
    path.resolve('ml/train.py'),
    '--org-id', orgId,
    '--train-json', path.resolve(trainJson),
    '--config-json', path.resolve(configJson),
    '--out-dir', path.resolve(outDir)
  ];
  const p = spawn(PY, args, {
    cwd: process.cwd(),
    env: { ...process.env, PYTHONUNBUFFERED: '1' }
  });
  p.stdout.on('data', d => onData?.(d.toString()));
  p.stderr.on('data', d => onData?.(d.toString()));
  p.on('close', code => onEnd?.(code));
  return p;
}

export function spawnPredict({ orgId, studentJson, artifactsDir, outFile, onData, onEnd }) {
  const PY = process.env.PYTHON_BIN || 'python3';
  const args = [
    path.resolve('ml/predict.py'),
    '--org-id', orgId,
    '--student-json', path.resolve(studentJson),
    '--artifacts-dir', path.resolve(artifactsDir),
    '--out-file', path.resolve(outFile)
  ];
  const p = spawn(PY, args, {
    cwd: process.cwd(),
    env: { ...process.env, PYTHONUNBUFFERED: '1' }
  });
  p.stdout.on('data', d => onData?.(d.toString()));
  p.stderr.on('data', d => onData?.(d.toString()));
  p.on('close', code => onEnd?.(code));
  return p;
}
