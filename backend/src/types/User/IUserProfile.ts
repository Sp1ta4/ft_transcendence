interface IUserProfileUpdate {
  first_name?:	string;
  last_name?:	string;
  username?:	string;
  avatarUrl?:	string | null;
  bio?:			string;
  birth_date?:	Date;
}

export type { IUserProfileUpdate }