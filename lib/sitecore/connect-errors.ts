export class SitecoreConnectError extends Error {
  readonly statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.name = "SitecoreConnectError";
    this.statusCode = statusCode;
  }
}

export function connectErrorStatusCode(error: unknown): number {
  if (error instanceof SitecoreConnectError) {
    return error.statusCode;
  }

  if (error instanceof SyntaxError) {
    return 400;
  }

  return 502;
}

export function connectErrorMessage(error: unknown): string {
  if (error instanceof SitecoreConnectError) {
    return error.message;
  }

  if (error instanceof SyntaxError) {
    return "Invalid request body. Refresh the page and try again.";
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Unable to connect to Sitecore XM Cloud.";
}
