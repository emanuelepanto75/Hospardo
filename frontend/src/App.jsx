import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './lib/auth';
import Layout from './components/Layout';
import Login from './pages/Login';
import Agenda from './pages/Agenda';
import Patients from './pages/Patients';
import PatientDetail from './pages/PatientDetail';
import Doctors from './pages/Doctors';
import DoctorDetail from './pages/DoctorDetail';
import Services from './pages/Services';
import Users from './pages/Users';
import Book from './pages/Book';
import ManageAppointment from './pages/ManageAppointment';

function Private() {
  const { user, loading } = useAuth();
  if (loading) return <p className="muted" style={{ padding: 24 }}>Caricamento…</p>;
  if (!user) return <Login />;
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/agenda" element={<Agenda />} />
        <Route path="/pazienti" element={<Patients />} />
        <Route path="/pazienti/:id" element={<PatientDetail />} />
        <Route path="/medici" element={<Doctors />} />
        <Route path="/medici/:id" element={<DoctorDetail />} />
        <Route path="/prestazioni" element={<Services />} />
        {user.role === 'ADMIN' && <Route path="/utenti" element={<Users />} />}
        <Route path="*" element={<Navigate to="/agenda" replace />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/prenota" element={<Book />} />
      <Route path="/appuntamento/:token" element={<ManageAppointment />} />
      <Route path="/*" element={<Private />} />
    </Routes>
  );
}
