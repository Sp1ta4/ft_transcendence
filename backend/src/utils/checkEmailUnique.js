import { container } from "../container.js"

export default async function checkEmailUnique(email) {
	const user = await container.usersRepository.getUserByEmail(email);
	if (user) { 
		return false;
	}
	return true;
}