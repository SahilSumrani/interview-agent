/**
 * Last-resort error handler. Express 5 forwards rejected promises from async
 * route handlers here automatically, so this catches anything the controllers'
 * own try/catch blocks miss instead of leaving the request hanging.
 */

function notFoundHandler(req, res) {
    res.status(404).json({ message: `Route not found: ${req.method} ${req.originalUrl}`, code: "NOT_FOUND" })
}

function errorHandler(err, req, res, next) {
    if (res.headersSent) return next(err)

    const status = Number(err?.status || err?.statusCode) || 500
    const isClientError = status >= 400 && status < 500

    if (isClientError) {
        console.warn(`${req.method} ${req.originalUrl} -> ${status}: ${err?.message}`)
    } else {
        console.error(`Unhandled error on ${req.method} ${req.originalUrl}:`, err)
    }

    // Never leak internals on a 500; client errors carry a useful message.
    const message = isClientError && err?.message
        ? err.message
        : "Something went wrong on the server. Please try again."

    res.status(status).json({ message, code: err?.code || (isClientError ? "BAD_REQUEST" : "INTERNAL_ERROR") })
}

module.exports = { errorHandler, notFoundHandler }
