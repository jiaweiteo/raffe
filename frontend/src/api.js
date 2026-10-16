import { authHeaders } from "./cloudAuth";

export async function api(path, options = {}) {
  const credentials = await authHeaders();
  let response;
  try {
    response = await fetch("/api" + path, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...credentials,
        ...options.headers,
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
  } catch {
    throw new Error(
      "Cannot reach the app. Keep your work here and check your connection.",
    );
  }
  if (!response.ok) {
    const error = await response.json();
    throw new Error(
      typeof error.detail === "string"
        ? error.detail
        : "Please check the entered values and try again.",
    );
  }
  return options.blob ? response.blob() : response.json();
}
export const post = (path, body = {}) => api(path, { method: "POST", body });
export const loadAuditReports = () => api("/audit/sheets");
