interface OAuthStrategy {
  buildAuthUrl(state: string): string;
}

class GoogleOAuthStrategy implements OAuthStrategy {
  buildAuthUrl(state: string): string {
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: process.env.GOOGLE_OAUTH_CLIENT_ID!,
      redirect_uri: `${process.env.PROVIDER_OAUTH_REDIRECT_URI}/google`,
      scope: 'openid email profile',
      state,
      access_type: 'offline',
      prompt: 'select_account',
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
  }
}

class GitHubOAuthStrategy implements OAuthStrategy {
  buildAuthUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: process.env.GITHUB_OAUTH_CLIENT_ID!,
      redirect_uri: `${process.env.PROVIDER_OAUTH_REDIRECT_URI}/github`,
      scope: 'read:user user:email',
      state,
    });
    return `https://github.com/login/oauth/authorize?${params}`;
  }
}

const strategies: Record<string, OAuthStrategy> = {
  google: new GoogleOAuthStrategy(),
  github: new GitHubOAuthStrategy(),
};

export { strategies };