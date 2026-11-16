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

/** Raggruppa le prestazioni per categoria (le non categorizzate in fondo) */
export function groupByCategory(list) {
  const out = {};
  for (const s of [...list].sort((a, b) => (a.category ? 0 : 1) - (b.category ? 0 : 1) || (a.category || '').localeCompare(b.category || '') || a.name.localeCompare(b.name))) {
    (out[s.category || 'Senza categoria'] ||= []).push(s);
  }
  return out;
}

export const NOTIFICATION_KIND = { CONFERMA: 'Conferma', PROMEMORIA: 'Promemoria', ANNULLAMENTO: 'Annullamento', SPOSTAMENTO: 'Spostamento' };
export const NOTIFICATION_STATUS = {
  INVIATO: { label: 'Inviato', color: '#16a34a' },
  SIMULATO: { label: 'Non inviato (canale non configurato)', color: '#64748b' },
  ERRORE: { label: 'Errore', color: '#dc2626' },
};
