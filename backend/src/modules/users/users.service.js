import {
	USER_EMAIL_CONFIRMATION_CODE_TTL,
	CONFIRM_CODE_REDIS_TAG,
	MAX_DEVICES,
} from '../../constants/users.js';
import { USER_NOT_FOUND_OR_INVALID_CRED } from '../../constants/error_messages.js';
import HttpError from '../../utils/error/HttpError.js';
import { hashPassword, comparePassword } from '../../utils/passwordUtils.js';
import { randomLong, sha256Hex } from '../../utils/hash.js';
import HttpStatus from 'http-status-codes';
import { v4 as uuidv4 } from 'uuid';
import moment from 'moment';
import { signAccess } from '../../utils/jwt.js';

class UsersService {
	constructor(repository) {
		this.repository = repository;
	}

	async getUsersList() {
		return await this.repository.getUsersList();
	}
}

export default UsersService;
