import React from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './AuthContext.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import SignIn from './pages/SignIn.jsx';
import SignUp from './pages/SignUp.jsx';
import TrainIntro from './pages/TrainIntro.jsx';
import TrainModels from './pages/TrainModels.jsx';
import TrainingComplete from './pages/TrainingComplete.jsx';
import DashboardLayout from './pages/DashboardLayout.jsx';
import DashboardSummary from './pages/DashboardSummary.jsx';
import DashboardPredict from './pages/DashboardPredict.jsx';
import DashboardHistory from './pages/DashboardHistory.jsx';
import DashboardRetrain from './pages/DashboardRetrain.jsx';
import PredictionDetail from './pages/PredictionDetail.jsx';

function AppRoutes() {
  return (
    <Routes>
      <Route path="/signin" element={<SignIn />} />
      <Route path="/signup" element={<SignUp />} />

      <Route element={<ProtectedRoute />}>
        <Route path="/train-model" element={<TrainIntro />} />
        <Route path="/train-models" element={<TrainModels />} />
        <Route path="/training-complete" element={<TrainingComplete />} />
        <Route path="/dashboard" element={<DashboardLayout />}>
          <Route index element={<Navigate to="summary" replace />} />
          <Route path="summary" element={<DashboardSummary />} />
          <Route path="predict" element={<DashboardPredict />} />
          <Route path="history" element={<DashboardHistory />} />
          <Route path="history/:id" element={<PredictionDetail />} />
          <Route path="retrain" element={<DashboardRetrain />} />
        </Route>
      </Route>

      <Route path="/" element={<Navigate to="/signin" replace />} />
      <Route path="*" element={<Navigate to="/signin" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  );
}
