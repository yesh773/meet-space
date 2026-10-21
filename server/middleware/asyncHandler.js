// Express 4 doesn't catch errors from async routes, so we forward them to the error handler.
export default (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
