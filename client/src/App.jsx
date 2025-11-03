import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import SignIn from './pages/SignIn.jsx';
import SignUp from './pages/SignUp.jsx';
import TrainModel from './pages/TrainModel.jsx';
import TrainModels from './pages/TrainModels.jsx';
import TrainingComplete from './pages/TrainingComplete.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Summary from './pages/Summary.jsx';
import Predict from './pages/Predict.jsx';
import History from './pages/History.jsx';
import Retrain from './pages/Retrain.jsx';
export default function App(){
  return (<Routes>
    <Route path="/signin" element={<SignIn/>}/>
    <Route path="/signup" element={<SignUp/>}/>
    <Route path="/train-model" element={<TrainModel/>}/>
    <Route path="/train-models" element={<TrainModels/>}/>
    <Route path="/training-complete" element={<TrainingComplete/>}/>
    <Route path="/dashboard" element={<Dashboard/>}>
      <Route index element={<Summary/>}/>
      <Route path="summary" element={<Summary/>}/>
      <Route path="predict" element={<Predict/>}/>
      <Route path="history" element={<History/>}/>
      <Route path="retrain" element={<Retrain/>}/>
    </Route>
    <Route path="*" element={<Navigate to="/signin" replace />}/>
  </Routes>);
}
