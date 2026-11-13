// Pure URL helpers, kept apart from config.ts so they can be unit-tested without
// the environment variables config.ts needs at import time.

/** The API's own public URL: PUBLIC_API_URL if set, otherwise guessed from the
 * site URL ("https://dhakakacchi.com" -> "https://api.dhakakacchi.com"), or the
 * local port in dev. */
export function derivePublicApiUrl(
  explicit: string | undefined,
  siteUrl: string,
  port: number,
): string {
  if (explicit) return explicit.replace(/\/+$/, "");
  try {
    const url = new URL(siteUrl);
    if (url.hostname === "localhost" || url.hostname === "127.0.0.1") {
      return `http://localhost:${port}`;
    }
    return `${url.protocol}//api.${url.hostname.replace(/^www\./, "")}`;
  } catch {
    return `http://localhost:${port}`;
  }
}
