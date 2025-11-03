import React from 'react';
import { Link } from 'react-router-dom';

export default function TrainIntro() {
  return (
    <div className="max-w-3xl mx-auto py-16 space-y-6">
      <h1 className="text-3xl font-bold">Train your organization-specific model</h1>
      <p className="text-gray-700">
        Upload your historical academic performance data and tune the configuration before running the
        Python training pipeline. You can customize the grade scale, ensemble hyperparameters, and
        risk thresholds to match your university's policies.
      </p>
      <Link
        to="/train-models"
        className="inline-block bg-indigo-600 text-white px-6 py-3 rounded-md hover:bg-indigo-700"
      >
        Configure training
      </Link>
    </div>
  );
}
