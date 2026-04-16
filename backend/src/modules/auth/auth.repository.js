class AuthRepository {
	constructor(db, cache) {
		this.db = db;
		this.cache = cache;
	}

	async addSession(userId, data) {
		try {
			await this.cache.zAdd(`user:${userId}:sessions`, [data]);
			await this.cache.expire(`user:${userId}:sessions`, process.env.REFRESH_TTL);
		} catch (error) {
			console.log(error);
		}
	}

	async createSession(userId, sessionId, sessionData) {
		try {
			await this.cache.set(`session:${userId}:${sessionId}`, JSON.stringify(sessionData), {
				EX: process.env.REFRESH_TTL,
			});
		} catch (error) {
			console.log(error);
		}
	}

	async getOldestSession(userId) {
		const key = `user:${userId}:sessions`;
		const res = await this.cache.zPopMin(key, 1);
		return res?.value;
	}

	async getSessions(userId) {
		return await this.cache.zCard(`user:${userId}:sessions`);
	}

	async removeSession(userId, sessionId) {
		await this.cache.del(`session:${userId}:${sessionId}`);
		await this.cache.zRem(`user:${userId}:sessions`, sessionId);
	}

	async deleteAllSessions(userId) {
		const key = `user:${userId}:sessions`;

		const allSessions = await this.cache.zRange(key, 0, -1);

		for (const sessionId of allSessions) {
			await this.removeSession(userId, sessionId);
		}
	}

	async getUserById(userId) {
		return await this.db.User.findUnique({
			where: {
				id: userId
			}
		});
	}
}

export default AuthRepository;
