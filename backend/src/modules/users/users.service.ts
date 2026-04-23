import type { IUserProfileUpdate } from '../../types/User/IUserProfile.js';
import type UsersRepository from './users.repository.js';
import type StorageService from '../../resources/s3.js';

class UsersService {
  private repository: UsersRepository;
  private storage: StorageService;

  constructor(repository: UsersRepository, storage: StorageService) {
    this.repository = repository;
    this.storage = storage;
  }

  async getUserById(id: number, requesterId: number) {
    const user = await this.repository.getUserById(id);
    if (!user) return null;
    if (id === requesterId) return user;

    const friends = await this.repository.areFriends(id, requesterId);
    if (!friends) {
      const { is_online: _o, last_seen: _l, ...publicProfile } = user;
      return publicProfile;
    }

    return user;
  }

  async getUserFollowers(id: number) {
    return this.repository.getUserFollowers(id);
  }

  async getUserFollowing(id: number) {
    return this.repository.getUserFollowing(id);
  }

  async followUser(userId: number, targetUserId: number) {
    return this.repository.followUser(userId, targetUserId);
  }

  async unfollowUser(userId: number, targetUserId: number) {
    return this.repository.unfollowUser(userId, targetUserId);
  }

  async updateUserProfile(userId: number, profileData: IUserProfileUpdate) {
    return this.repository.updateUserProfile(userId, profileData);
  }

  async updateUserAvatar(userId: number, file: Express.Multer.File) {
    const user = await this.repository.getUserById(userId);

    const avatarUrl = await this.storage.uploadFile(file, `images/${userId}`);

    if (user?.avatar_url) {
      await this.storage.deleteFile(user.avatar_url).catch((err) => {
        console.warn('Failed to delete old avatar:', err);
      });
    }

    return this.repository.updateUserProfile(userId, { avatar_url: avatarUrl });
  }

  async deleteUserAvatar(userId: number) {
    const user = await this.repository.getUserById(userId);
    if (!user?.avatar_url) return;

    await this.storage.deleteFile(user.avatar_url).catch((err) => {
      console.warn('Failed to delete avatar:', err);
    });

    return this.repository.updateUserProfile(userId, { avatar_url: null });
  }

  async searchUsers(query: string, limit: number) {
    return this.repository.getUsersList(query, limit);
  }
}

export default UsersService;