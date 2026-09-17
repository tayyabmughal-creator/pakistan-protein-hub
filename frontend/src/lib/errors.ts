import { AxiosError } from "axios";

/**
 * Reading an error message safely.
 *
 * Every catch block in this app used `catch (error: any)` and then reached
 * straight into `error.response.data.error`. That is three unchecked property
 * accesses on a value that is not guaranteed to be an object at all — a
 * network failure, a thrown string, or a DRF response shaped differently from
 * the one assumed would each produce "Cannot read properties of undefined"
 * *while already handling an error*, so the user saw a blank screen instead of
 * the real problem.
 */

/** DRF error bodies come back in several shapes depending on the view. */
type ApiErrorBody = {
  error?: string;
  detail?: string;
  message?: string;
  non_field_errors?: string[];
  [field: string]: unknown;
};

function firstFieldError(body: ApiErrorBody): string | null {
  for (const [field, value] of Object.entries(body)) {
    if (field === "error" || field === "detail" || field === "message") continue;
    if (typeof value === "string" && value.trim()) return value;
    if (Array.isArray(value) && typeof value[0] === "string" && value[0].trim()) {
      // Field-level validation errors read better with the field named.
      return `${field.replace(/_/g, " ")}: ${value[0]}`;
    }
  }
  return null;
}

/**
 * Turn any thrown value into something worth showing a customer.
 *
 * @param error    the caught value, of genuinely unknown type
 * @param fallback shown when the error carries nothing usable
 */
export function getErrorMessage(
  error: unknown,
  fallback = "Something went wrong. Please try again.",
): string {
  if (error instanceof AxiosError) {
    if (!error.response) {
      return "Could not reach the server. Please check your connection and try again.";
    }

    const body = error.response.data as ApiErrorBody | string | undefined;

    if (typeof body === "string" && body.trim()) return body;

    if (body && typeof body === "object") {
      if (typeof body.error === "string" && body.error.trim()) return body.error;
      if (typeof body.detail === "string" && body.detail.trim()) return body.detail;
      if (typeof body.message === "string" && body.message.trim()) return body.message;
      if (body.non_field_errors?.[0]) return body.non_field_errors[0];

      const fieldError = firstFieldError(body);
      if (fieldError) return fieldError;
    }

    if (error.response.status >= 500) {
      return "The server had a problem handling that. Please try again shortly.";
    }
    return error.message || fallback;
  }

  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error.trim()) return error;

  return fallback;
}

/** HTTP status of a failed request, when there was a response at all. */
export function getErrorStatus(error: unknown): number | null {
  return error instanceof AxiosError ? (error.response?.status ?? null) : null;
}
