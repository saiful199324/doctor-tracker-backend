import type { ErrorRequestHandler, RequestHandler } from 'express';
import mongoose from 'mongoose';
import { env } from '../config/env';
import { ApiError } from '../utils/ApiError';

export const notFound: RequestHandler = (req, _res, next) => {
  next(ApiError.notFound(`Route ${req.method} ${req.originalUrl} not found`));
};

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  let status = 500;
  let message = 'Something went wrong';
  let details: unknown;

  if (err instanceof ApiError) {
    status = err.statusCode;
    message = err.message;
    details = err.details;
  } else if (err instanceof mongoose.Error.CastError) {
    status = 400;
    message = `Invalid value for ${err.path}`;
  } else if (err instanceof mongoose.Error.ValidationError) {
    status = 400;
    message = 'Validation failed';
    details = Object.fromEntries(Object.entries(err.errors).map(([k, v]) => [k, [v.message]]));
  } else if (err?.code === 11000) {
    status = 409;
    const field = Object.keys(err.keyValue ?? {})[0] ?? 'field';
    message = `A record with this ${field} already exists`;
    details = { [field]: [`This ${field} is already in use`] };
  } else if (err?.type === 'entity.parse.failed') {
    status = 400;
    message = 'Malformed JSON body';
  } else if (err?.type === 'entity.too.large') {
    status = 413;
    message = 'Request body is too large';
  } else if (err?.expose && err.status >= 400 && err.status < 500) {
    // Other client errors raised by body-parser / http-errors (e.g. unsupported charset)
    status = err.status;
    message = err.message;
  }

  if (status >= 500) console.error(err);

  res.status(status).json({
    success: false,
    message,
    ...(details ? { errors: details } : {}),
    ...(status >= 500 && !env.isProduction ? { stack: err?.stack } : {}),
  });
};
