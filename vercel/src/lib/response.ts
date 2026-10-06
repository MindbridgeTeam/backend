export function apiResponse<T>(success: boolean, data?: T, error?: string) {
  return {
    success,
    data,
    error,
  };
}
