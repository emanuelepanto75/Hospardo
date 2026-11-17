const { ZodError } = require('zod');
const { Prisma } = require('@prisma/client');

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: 'Dati non validi',
      details: err.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
    });
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      const field = Array.isArray(err.meta?.target) ? err.meta.target.join(', ') : err.meta?.target;
      return res.status(409).json({ error: `Valore già presente (${field})` });
    }
    if (err.code === 'P2025') return res.status(404).json({ error: 'Elemento non trovato' });
    if (err.code === 'P2003') return res.status(409).json({ error: 'Elemento collegato ad altri dati, impossibile eliminarlo' });
  }
  const status = err.status || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: status >= 500 ? 'Errore interno del server' : err.message, details: err.details });
}

module.exports = errorHandler;
