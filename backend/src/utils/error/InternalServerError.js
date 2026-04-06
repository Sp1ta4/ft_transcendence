import { INTERNAL_SERVER_ERROR_MESSAGE } from "http-status-codes";
import { HttpError } from './HttpError';
import HttpStatus from "http-status-codes";

export class DataValidationError extends HttpError {
	constructor(message = INTERNAL_SERVER_ERROR_MESSAGE) {
		super(HttpStatus.INTERNAL_SERVER_ERROR, message);
	}
}