const LOG_PREFIX = "[MigrateX:presentation-hierarchy]";

export function logPresentationHierarchy(
  message: string,
  data?: Record<string, unknown>,
): void {
  if (data) {
    console.log(LOG_PREFIX, message, data);
  } else {
    console.log(LOG_PREFIX, message);
  }
}
