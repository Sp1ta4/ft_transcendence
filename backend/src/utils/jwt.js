import jwt from 'jsonwebtoken';

export function signAccess(userId, sessionId) {
	try {
		const jwttoken = jwt.sign({ sub: userId, sid: sessionId }, process.env.ACCESS_SECRET, {
			expiresIn: process.env.ACCESS_EXPIRES,
		});
		return jwttoken;
	} catch (error) {
		console.log(error);
	}
}

export function verifyAccess(token) {
	return jwt.verify(token, process.env.ACCESS_SECRET);
}
