import { describe, expect, it } from "vitest";
import { AxiosError, AxiosHeaders } from "axios";

import { getErrorMessage, getErrorStatus } from "./errors";

/**
 * These cover the shapes the API genuinely returns, and the ones that used to
 * crash. Every catch block in the app previously did
 * `error.response.data.error` on a value of unknown type — three unchecked
 * property accesses while already handling an error, so a network failure
 * produced "cannot read properties of undefined" and the customer saw nothing.
 */

function axiosError(status: number, data: unknown): AxiosError {
  const error = new AxiosError("Request failed");
  error.response = {
    status,
    statusText: "",
    data,
    headers: new AxiosHeaders(),
    config: { headers: new AxiosHeaders() },
  };
  return error;
}

describe("getErrorMessage", () => {
  it("reads DRF's `error` key", () => {
    expect(getErrorMessage(axiosError(400, { error: "Cart is empty" }))).toBe("Cart is empty");
  });

  it("reads DRF's `detail` key", () => {
    expect(getErrorMessage(axiosError(404, { detail: "Not found." }))).toBe("Not found.");
  });

  it("reads non_field_errors", () => {
    const message = getErrorMessage(
      axiosError(400, { non_field_errors: ["You have already reviewed this product."] }),
    );
    expect(message).toBe("You have already reviewed this product.");
  });

  it("names the field for a field-level validation error", () => {
    const message = getErrorMessage(axiosError(400, { phone_number: ["Enter a valid number."] }));
    expect(message).toBe("phone number: Enter a valid number.");
  });

  it("prefers `error` over a field error when both are present", () => {
    const message = getErrorMessage(
      axiosError(400, { error: "Out of stock", quantity: ["Too many"] }),
    );
    expect(message).toBe("Out of stock");
  });

  it("explains a connection failure rather than showing a generic message", () => {
    // No `response` at all — the request never reached the server. This is the
    // case that used to throw inside the error handler.
    const message = getErrorMessage(new AxiosError("Network Error"));
    expect(message).toContain("Could not reach the server");
  });

  it("does not show a raw 500 body to a customer", () => {
    const message = getErrorMessage(axiosError(500, {}));
    expect(message).toContain("server had a problem");
  });

  it("handles a plain string body", () => {
    expect(getErrorMessage(axiosError(400, "Something specific"))).toBe("Something specific");
  });

  it("falls back when the body carries nothing usable", () => {
    expect(getErrorMessage(axiosError(400, {}), "Could not save")).toBe("Could not save");
  });

  it("handles a thrown Error", () => {
    expect(getErrorMessage(new Error("boom"))).toBe("boom");
  });

  it("handles a thrown string", () => {
    expect(getErrorMessage("just a string")).toBe("just a string");
  });

  it("never throws, whatever it is given", () => {
    for (const value of [null, undefined, 0, false, [], {}, Symbol("x"), NaN]) {
      expect(() => getErrorMessage(value)).not.toThrow();
      expect(typeof getErrorMessage(value)).toBe("string");
    }
  });

  it("returns a non-empty message in every case", () => {
    expect(getErrorMessage(axiosError(400, { error: "" }), "fallback")).toBe("fallback");
    expect(getErrorMessage(axiosError(400, { detail: "   " }), "fallback")).toBe("fallback");
  });
});

describe("getErrorStatus", () => {
  it("reports the HTTP status when there was a response", () => {
    expect(getErrorStatus(axiosError(404, {}))).toBe(404);
  });

  it("reports null when the request never got a response", () => {
    expect(getErrorStatus(new AxiosError("Network Error"))).toBeNull();
    expect(getErrorStatus(new Error("boom"))).toBeNull();
  });
});
