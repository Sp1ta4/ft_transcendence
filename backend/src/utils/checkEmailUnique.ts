import { container } from '../container.js';

export default async function checkEmailUnique(email: string): Promise<boolean> {
  const user = await container.usersRepository.getUserByEmail(email);
  return user === null;
}
