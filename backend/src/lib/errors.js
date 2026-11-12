class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

const notFound = (what = 'Risorsa') => new HttpError(404, `${what} non trovato/a`);

/** Avvolge un handler async per inoltrare gli errori a Express */
const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

module.exports = { HttpError, notFound, ah };
