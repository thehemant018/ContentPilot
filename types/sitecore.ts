export interface SitecoreConnectionInput {
  instanceUrl: string;
  clientId: string;
  clientSecret: string;
}

export interface SitecoreTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope?: string;
}

export interface SitecoreConnectionResult {
  success: boolean;
  message: string;
  token?: string;
  expiresIn?: number;
  instanceUrl?: string;
  contentApiVerified?: boolean;
}

export interface StoredSitecoreSession {
  accessToken: string;
  expiresAt: number;
  instanceUrl: string;
  connectedAt: string;
}
