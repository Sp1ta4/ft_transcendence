import type UsersRepository from './users.repository.js';

class UsersService {
  private repository: UsersRepository;

  constructor(repository: UsersRepository) {
    this.repository = repository;
  }

  async getUsersList() {
    return this.repository.getUsersList();
  }
}

export default UsersService;
