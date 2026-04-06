import { INTERNAL_SERVER_ERROR_MESSAGE, DATA_VALIDATION_ERROR_MESSAGE } from "../constants/error_messages.js";
import HttpStatus from "http-status-codes";

export function errorHandler(err, req, res, next) {	
	const status = err.status || HttpStatus.INTERNAL_SERVER_ERROR;
    
    res.status(status).json({
        error: err.message || INTERNAL_SERVER_ERROR_MESSAGE,
    });
}
