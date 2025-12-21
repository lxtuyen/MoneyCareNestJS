export interface GoogleOAuthTokenResponse {
  access_token: string;
  expires_in: number;
  token_type: 'Bearer';
  scope?: string;
  refresh_token?: string;
}

export interface GoogleOAuthRefreshResponse {
  access_token: string;
  expires_in: number;
  token_type: 'Bearer';
  scope?: string;
}
