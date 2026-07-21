export interface SitecoreConnectionInput {
  instanceUrl: string;
  clientId: string;
  clientSecret: string;
  /** Optional Sitecore username to use as item Owner after connect. */
  itemOwner?: string;
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
  itemOwnerVerified?: boolean;
  itemOwner?: string;
}

export interface StoredSitecoreSession {
  accessToken: string;
  expiresAt: number;
  instanceUrl: string;
  connectedAt: string;
  /** Sitecore username for item Security Owner (e.g. sitecore\user@company.com). */
  itemOwner?: string;
}
