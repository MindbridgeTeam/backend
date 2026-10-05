export interface ApiSuccess<T> {
  success: true;
  data: T;
  error: null;
}

export interface ApiFailure {
  success: false;
  data: null;
  error: {
    code: string;
    message: string;
  };
}

export function ok<T>(data: T): ApiSuccess<T> {
  return { success: true, data, error: null };
}

export function fail(code: string, message: string): ApiFailure {
  return { success: false, data: null, error: { code, message } };
}
