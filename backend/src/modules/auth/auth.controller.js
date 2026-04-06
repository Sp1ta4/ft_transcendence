import checkEmailUnique from '../../utils/checkEmailUnique.js';
import validateSchema from '../../utils/validateSchema.js';
import { CONFIRM_YOUR_EMAIL } from '../../constants/success_messages.js';
import HttpStatus from 'http-status-codes';
import Joi from 'joi';
import DataValidationError from '../../utils/error/DataValidationError.js';
import { verifyAccess } from '../../utils/jwt.js';

class AuthController {
	constructor(service) {
		this.service = service;
	}

	register = async (req, res, next) => {
		try {
			const { body } = req;

			const {
				first_name,
				last_name,
				email,
				username,
				password,
				birth_date,
				role,
				avatar_url,
			} = validateSchema(
				body,
				Joi.object({
					first_name: Joi.string().min(2).max(42).required(),
					last_name: Joi.string().min(2).max(42).required(),
					email: Joi.string().email().required(),
					username: Joi.string().alphanum().min(3).max(30).required(),
					password: Joi.string()
						.pattern(/[A-Za-z]/, 'letter')
						.pattern(/\d/, 'digit')
						.min(8)
						.max(64)
						.required(),
					birth_date: Joi.date().less('now').required(),
					role: Joi.string().optional().valid('user', 'admin').default('user'),
					avatar_url: Joi.string().uri().optional().allow(null).default(null),
				})
			);
			if (!checkEmailUnique(email)) {
				throw new DataValidationError('Email is already in use');
			}
			await this.service.register({
				first_name,
				last_name,
				email,
				username,
				password,
				birth_date,
				role,
				avatar_url,
			});
			res.status(HttpStatus.OK).json({ message: CONFIRM_YOUR_EMAIL });
		} catch (error) {
			next(error);
		}
	};

	confirm = async (req, res, next) => {
		try {
			const { body } = req;

			const { email, confirmation_code } = validateSchema(
				body,
				Joi.object({
					email: Joi.string().email().required(),
					confirmation_code: Joi.string().length(6).required(),
				})
			);
			await this.service.confirm(email, confirmation_code);
			res.status(HttpStatus.CREATED).json({ message: 'You successfully registered' });
		} catch (error) {
			next(error);
		}
	};

	login = async (req, res, next) => {
		try {
			const { body } = req;

			const { email, password, fingerprint } = validateSchema(
				body,
				Joi.object({
					email: Joi.string().email().required(),
					password: Joi.string()
						.pattern(/[A-Za-z]/, 'letter')
						.pattern(/\d/, 'digit')
						.min(8)
						.max(64)
						.required(),
					fingerprint: Joi.string().uuid().required(),
				})
			);

			const result = await this.service.login({ email, password, fingerprint });
			this.setRefreshCookie(res, result.refreshToken);
			this.setSessionIdCookie(res, result.sessionId);
			res.status(HttpStatus.OK).json({
				accessToken: result.accessToken,
				user: result.user,
			});
		} catch (error) {
			next(error);
		}
	};

	refresh = async (req, res, next) => {
		try {
			const { body } = req;

			const { userId, fingerprint } = validateSchema(
				body,
				Joi.object({
					userId: Joi.number().positive().required(),
					fingerprint: Joi.string().uuid().required(),
				})
			);
			const refreshToken = req.cookies?.refreshToken;
			const sessionId = req.cookies?.sessionId;

			if (!refreshToken || !sessionId) {
				throw new DataValidationError();
			}

			const tokens = await this.service.refresh({
				userId,
				sessionId,
				refreshToken,
				fingerprint,
			});
			console.log('$$$$$$$$$$$', tokens);

			this.setRefreshCookie(res, tokens.refreshToken);
			this.setSessionIdCookie(res, tokens.sessionId);
			res.status(HttpStatus.OK).json({ accessToken: tokens.accessToken });
		} catch (err) {
			res.clearCookie('refreshToken');
			res.clearCookie('sessionId');
			next(err);
		}
	};

	logout = async (req, res, next) => {
		try {
			const { body } = req;

			const { userId, sessionId } = validateSchema(
				body,
				Joi.object({
					userId: Joi.number().positive().required(),
					sessionId: Joi.string().uuid().required(),
				})
			);
			await this.service.logout({ userId, sessionId });
			res.clearCookie('refreshToken');
			res.clearCookie('sessionId');
			res.status(HttpStatus.OK).send();
		} catch (err) {
			next(err);
		}
	};

	setRefreshCookie = (res, token) => {
		res.cookie('refreshToken', token, {
			httpOnly: true,
			secure: process.env.NODE_ENV === 'production',
			sameSite: 'lax',
			maxAge: 30 * 24 * 3600 * 1000, // 30 days
		});
	};

	setSessionIdCookie = (res, sid) => {
		res.cookie('sessionId', sid, {
			httpOnly: true,
			secure: process.env.NODE_ENV === 'production',
			sameSite: 'lax',
			maxAge: 30 * 24 * 3600 * 1000, // 30 days
		});
	};

	validateToken = async (req, res) => {
		try {
			const token = req.headers['authorization']?.split(' ')[1];

			if (!token) {
				return res.status(401).json({ error: 'No token provided' });
			}

			const decoded = verifyAccess(token);

			res.setHeader('X-User-Id', decoded.sub);
			res.status(200).send();
		} catch (err) {
			console.error('Token validation error:', err.message);
			return res.status(403).json({ error: 'Invalid token' });
		}
	};
}

export default AuthController;
