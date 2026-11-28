import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './lib/auth';
import { isAdmin } from './lib/constants';
import Layout from './components/Layout';
import Login from './pages/Login';
import Agenda from './pages/Agenda';
import Patients from './pages/Patients';
import PatientDetail from './pages/PatientDetail';
import Doctors from './pages/Doctors';
import DoctorDetail from './pages/DoctorDetail';
import Services from './pages/Services';
import Users from './pages/Users';
import Reminders from './pages/Reminders';
import PrintWeek from './pages/PrintWeek';
import Requests from './pages/Requests';
import EmergencyDevices from './pages/EmergencyDevices';
import Book from './pages/Book';
import Plans from './pages/Plans';
import Privacy from './pages/Privacy';
import Releases from './pages/Releases';
import Stock from './pages/Stock';
import StockItem from './pages/StockItem';
import ManageAppointment from './pages/ManageAppointment';

function Private() {
  const { user, loading } = useAuth();
  if (loading) return <p className="muted" style={{ padding: 24 }}>Caricamento…</p>;
  if (!user) return <Login />;
  return (
    <Routes>
      <Route path="/stampa" element={<PrintWeek />} />
      <Route path="/stampa/settimana" element={<PrintWeek />} />
      <Route element={<Layout />}>
        <Route path="/agenda" element={<Agenda />} />
        <Route path="/promemoria" element={<Reminders />} />
        {(isAdmin(user) || user.role === 'SEGRETERIA') && <Route path="/richieste" element={<Requests />} />}
        <Route path="/pazienti" element={<Patients />} />
        <Route path="/pazienti/:id" element={<PatientDetail />} />
        <Route path="/medici" element={<Doctors />} />
        <Route path="/medici/:id" element={<DoctorDetail />} />
        <Route path="/prestazioni" element={<Services />} />
        <Route path="/novita" element={<Releases />} />
        {user.plans && <Route path="/piani" element={<Plans />} />}
        {user.plans && <Route path="/magazzino" element={<Stock />} />}
        {user.plans && <Route path="/magazzino/articoli/:id" element={<StockItem />} />}
        {isAdmin(user) && <Route path="/utenti" element={<Users />} />}
        {isAdmin(user) && <Route path="/postazioni" element={<EmergencyDevices />} />}
        <Route path="*" element={<Navigate to="/agenda" replace />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/prenota" element={<Book />} />
      <Route path="/privacy" element={<Privacy />} />
      <Route path="/appuntamento/:token" element={<ManageAppointment />} />
      <Route path="/*" element={<Private />} />
    </Routes>
  );
}
