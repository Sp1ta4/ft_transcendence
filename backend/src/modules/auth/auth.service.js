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

class AuthService {
	constructor(repository, usersRepository) {
		this.repository = repository;
		this.usersRepository = usersRepository;
	}

	async register(userData) {
		userData.code = Math.random().toString(36).substring(2, 8);

		await this.repository.cache.set(
			`${CONFIRM_CODE_REDIS_TAG}:${userData.email}`,
			JSON.stringify(userData),
			{
				EX: USER_EMAIL_CONFIRMATION_CODE_TTL,
			}
		);

		console.log('##########\n');
		console.log(`Confirmation code for ${userData.email} sended: ${userData.code}`);
		console.log('\n##########');
	}

	async confirm(email, confirmationCode) {
		let userData = await this.repository.cache.get(`${CONFIRM_CODE_REDIS_TAG}:${email}`);
		if (!userData) {
			throw new HttpError(HttpStatus.BAD_REQUEST, 'Confirmation code expired or invalid');
		}
		userData = JSON.parse(userData);

		if (userData.code === confirmationCode) {
			userData.password = await hashPassword(userData.password);

			const result = await this.usersRepository.createUser(userData);
			if (!result) {
				throw new HttpError(HttpStatus.INTERNAL_SERVER_ERROR, 'User creation failed');
			}
			await this.repository.cache.del(`${CONFIRM_CODE_REDIS_TAG}:${email}`);
		} else {
			throw new HttpError(HttpStatus.BAD_REQUEST, 'Confirmation code expired or invalid');
		}
	}

	async login({ email, password, fingerprint }) {
		console.log(this.usersRepository);

		const user = await this.usersRepository.getUserByEmail(email);

		if (!user || !(await comparePassword(password, user.password_hash))) {
			throw new HttpError(HttpStatus.BAD_REQUEST, USER_NOT_FOUND_OR_INVALID_CRED);
		}

		const { sessionId, refreshToken } = await this.addNewSession(user.id, fingerprint);
		const accessToken = signAccess(user.id, sessionId);

		return { accessToken, refreshToken, sessionId, user };
	}

	async refresh({ userId, refreshToken, sessionId, fingerprint }) {
		let stored = await this.usersRepository.getCachedUser(userId, sessionId);
		if (!stored) {
			throw new HttpError(HttpStatus.BAD_REQUEST, 'invalid refresh token');
		}
		stored = JSON.parse(stored);
		const sentHash = sha256Hex(refreshToken);

		if (moment().unix() >= stored.absoluteExpireAt) {
			await this.repository.removeSession(userId, sessionId);
			throw new HttpError(HttpStatus.UNAUTHORIZED, 'Session expired, please login again');
		}

		if (sentHash !== stored.tokenHash) {
			await this.repository.deleteAllSessions(userId);
			throw new Error('Refresh token reuse or invalid — all sessions revoked');
		}

		if (fingerprint !== stored.fingerprint) {
			await this.repository.deleteAllSessions(userId);
			throw new Error('Fingerprint mismatch — all sessions revoked');
		}

		await this.repository.removeSession(userId, sessionId);

		const newSessionData = await this.addNewSession(userId, fingerprint);

		const accessToken = signAccess(userId, newSessionData.sessionId);
		return {
			accessToken,
			refreshToken: newSessionData.refreshToken,
			sessionId: newSessionData.sessionId,
		};
	}

	async logout({ userId, sessionId }) {
		await this.repository.removeSession(userId, sessionId);
	}

	async addNewSession(userId, fingerprint) {
		const sessionsCount = await this.repository.getSessions(userId);

		if (sessionsCount >= MAX_DEVICES) {
			const oldestSessionId = await this.repository.getOldestSession(userId);
			await this.repository.removeSession(userId, oldestSessionId);
		}

		const sessionId = uuidv4();
		const now = moment.now();

		await this.repository.addSession(userId, {
			value: sessionId,
			score: now,
		});

		const refreshToken = randomLong();
		const tokenHash = sha256Hex(refreshToken);
		const sessionData = {
			tokenHash,
			fingerprint,
			createdAt: now,
			absoluteExpireAt: moment().add(60, 'days').unix(),
		};

		await this.repository.createSession(userId, sessionId, sessionData);

		return {
			sessionId,
			refreshToken,
		};
	}
}

export default AuthService;
