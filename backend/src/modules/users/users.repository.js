class UsersRepository {
	constructor(db, cache) {
		this.db = db;
		this.cache = cache;
	}

	async getUserByEmail(email) {
		return await this.db.user.findUnique({ where: { email } });
	}

	async createUser(userData) {
		const user = await this.db.user.create({
			data: {
				first_name: userData.first_name,
				last_name: userData.last_name,
				email: userData.email,
				username: userData.username,
				password_hash: userData.password,
				role: userData.role,
				avatar_url: userData.avatar_url,
				birth_date: new Date(userData.birth_date),
			},
			select: { id: true },
		});
		return user.id;
	}

	async getCachedUser(userId, sessionId) {
		return await this.cache.get(`session:${userId}:${sessionId}`);
	}

	async getUsersList() {
		return await this.db.user.findMany();
	}
}

export default UsersRepository;
