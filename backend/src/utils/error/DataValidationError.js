import HttpError from "./HttpError.js";
import { DATA_VALIDATION_ERROR_MESSAGE } from "../../constants/error_messages.js";
import HttpStatus from "http-status-codes";

export default class DataValidationError extends HttpError {
	constructor(message = DATA_VALIDATION_ERROR_MESSAGE) {
		super(HttpStatus.BAD_REQUEST, message);
	}
}