import { Routes, Route, Navigate } from 'react-router-dom';
import AppLayout from './components/AppLayout';
import Menu from './pages/Menu';
import DishDetail from './pages/DishDetail';
import Ingredients from './pages/Ingredients';

export default function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<Navigate to="/menu" replace />} />
        <Route path="/menu" element={<Menu />} />
        <Route path="/menu/:id" element={<DishDetail />} />
        <Route path="/ingredients" element={<Ingredients />} />
        <Route path="*" element={<Navigate to="/menu" replace />} />
      </Route>
    </Routes>
  );
}
