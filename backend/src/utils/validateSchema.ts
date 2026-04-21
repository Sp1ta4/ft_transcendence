import type { Schema } from 'joi';
import DataValidationError from './error/DataValidationError.js';

export default function validateSchema<T>(data: unknown, schema: Schema<T>): T {
  const { error, value } = schema.validate(data, { abortEarly: false });

  if (error) {
    throw new DataValidationError(error.details.map(d => d.message));
  }

  return value as T;
}
