import axios from "axios";

const looksLikeHtmlDocument = (value: string) => /<!doctype html>|<html[\s>]|<body[\s>]|<h1>/i.test(value);

const pickMessage = (value: unknown): string | null => {
  if (!value) return null;
  if (typeof value === "string" && value.trim()) {
    const normalized = value.trim();
    return looksLikeHtmlDocument(normalized) ? null : normalized;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const nested = pickMessage(item);
      if (nested) return nested;
    }
    return null;
  }

  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    for (const key of ["detail", "message", "error", "non_field_errors"]) {
      const nested = pickMessage(record[key]);
      if (nested) return nested;
    }

    for (const nestedValue of Object.values(record)) {
      const nested = pickMessage(nestedValue);
      if (nested) return nested;
    }
  }

  return null;
};

export const toAppError = (error: unknown, fallback = "Something went wrong.") => {
  if (axios.isAxiosError(error)) {
    if (!error.response) {
      return new Error("Can't reach the server. Check your internet connection or API URL.");
    }

    const status = error.response.status;
    const serverMessage = pickMessage(error.response.data);

    if (status === 401) {
      return new Error("Your session expired. Please sign in again.");
    }

    if (status === 403) {
      return new Error(serverMessage || "This account does not have access to the admin mobile app.");
    }

    if (status === 404) {
      return new Error(serverMessage || "That record could not be found.");
    }

    if (status === 400 || status === 422) {
      return new Error(serverMessage || "Some information is missing or invalid.");
    }

    if (status >= 500) {
      return new Error("The server ran into a problem. Please try again in a moment.");
    }

    return new Error(serverMessage || fallback);
  }

  if (error instanceof Error && error.message.trim()) {
    return error;
  }

  if (typeof error === "string" && error.trim()) {
    return new Error(error);
  }

  return new Error(fallback);
};

export const reportAppError = (
  error: unknown,
  context: string,
  extra?: Record<string, unknown>,
) => {
  const normalized = toAppError(error);
  console.error(`[admin-mobile:${context}]`, {
    message: normalized.message,
    extra,
  });
  return normalized;
};
