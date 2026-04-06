import checkEmailUnique from '../../utils/checkEmailUnique.js';
import validateSchema from '../../utils/validateSchema.js';
import { CONFIRM_YOUR_EMAIL } from '../../constants/success_messages.js';
import HttpStatus from 'http-status-codes';
import Joi from 'joi';
import DataValidationError from '../../utils/error/DataValidationError.js';
import { INTERNAL_SERVER_ERROR_MESSAGE } from '../../constants/error_messages.js';

class UsersController {
	constructor(service) {
		this.service = service;
	}
	getUsersList = async (req, res, next) => {
		try {
			const users = await this.service.getUsersList();
			console.log(users);

			res.status(HttpStatus.OK).json({ data: users });
		} catch (err) {
			next(err);
		}
	};
}

export default UsersController;
