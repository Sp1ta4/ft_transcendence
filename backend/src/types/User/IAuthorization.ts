interface IRegisterBody {
  first_name: string;
  last_name: string;
  email: string;
  username: string;
  password: string;
  birth_date: Date;
  role: string;
}

interface IConfirmBody {
  email: string;
  confirmation_code: string;
}

interface ILoginBody {
  email: string;
  password: string;
  fingerprint: string;
}

interface IRefreshBody {
  userId: number;
  fingerprint: string;
}

interface ILogoutBody {
  userId: number;
  sessionId: string;
}

interface ICreateUserData {
  first_name: string;
  last_name: string;
  email: string;
  username: string;
  password: string;
  role: string;
  avatar_url?: string;
  birth_date: Date;
}

interface ISessionData {
  tokenHash: string;
  fingerprint: string;
  createdAt: number;
  absoluteExpireAt: number;
}

interface IAddSessionData {
  value: string;
  score: number;
}

interface IRegisterData {
  first_name: string;
  last_name: string;
  email: string;
  username: string;
  password: string;
  birth_date: Date;
  role: string;
}

interface ILoginData {
  email: string;
  password: string;
  fingerprint: string;
}

interface IRefreshData {
  userId: number;
  refreshToken: string;
  sessionId: string;
  fingerprint: string;
}

interface IStoredSession {
  tokenHash: string;
  fingerprint: string;
  createdAt: number;
  absoluteExpireAt: number;
}

export type { IRegisterBody, IConfirmBody, ILoginBody, IRefreshBody, ILogoutBody, ICreateUserData, ISessionData, IAddSessionData, IRegisterData, ILoginData, IRefreshData, IStoredSession };