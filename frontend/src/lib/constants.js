export const STATUS = {
  PRENOTATO: { label: 'Prenotato', color: '#64748b' },
  CONFERMATO: { label: 'Confermato', color: '#2563eb' },
  IN_ATTESA: { label: 'In sala d\'attesa', color: '#d97706' },
  COMPLETATO: { label: 'Completato', color: '#16a34a' },
  ANNULLATO: { label: 'Annullato', color: '#dc2626' },
  NON_PRESENTATO: { label: 'Non presentato', color: '#7c3aed' },
};

export const ROLES = { ADMIN: 'Amministratore', SEGRETERIA: 'Segreteria', MEDICO: 'Medico' };

export const doctorName = (d) => (d ? `${d.title || ''} ${d.firstName} ${d.lastName}`.trim() : '');
export const patientName = (p) => (p ? `${p.lastName} ${p.firstName}` : '');
