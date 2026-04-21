import HttpError from './HttpError.js';
import { DATA_VALIDATION_ERROR_MESSAGE } from '../../constants/error_messages.js';
import { StatusCodes } from 'http-status-codes';

export default class DataValidationError extends HttpError {
  constructor(message: string | string[] = DATA_VALIDATION_ERROR_MESSAGE) {
    const msg = Array.isArray(message) ? message.join(', ') : message;
    super(StatusCodes.BAD_REQUEST, msg);
    this.name = 'DataValidationError';
  }
}
