import "server-only";

import { serverEnv } from "@/lib/env";

/**
 * Google Docs export.
 *
 * Rather than hand-assembling hundreds of `documents.batchUpdate` requests —
 * which is fiddly and reproduces the layout badly — we upload the DOCX we
 * already generate and ask Drive to convert it. Google's own importer handles
 * headings, spacing, page numbers and fonts far better than we would, and there
 * is only one document pipeline to keep correct.
 *
 * Scope: `drive.file` only. That grants access to files this application
 * creates and nothing else — it cannot read the user's existing Drive. The
 * scope is also requested *here*, at the moment somebody asks for this export,
 * and never during ordinary sign-in.
 */

export const GOOGLE_DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";

export function googleAuthUrl(redirectUri: string, state: string): string {
  const clientId = serverEnv.googleDocsClientId;
  if (!clientId) throw new Error("Google Docs export is not configured.");

  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", GOOGLE_DRIVE_SCOPE);
  url.searchParams.set("state", state);
  // We want no refresh token: this is a one-shot export, so there is nothing to
  // store and nothing to leak later.
  url.searchParams.set("access_type", "online");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("include_granted_scopes", "false");
  return url.toString();
}

export async function exchangeCodeForToken(
  code: string,
  redirectUri: string,
): Promise<string | null> {
  const clientId = serverEnv.googleDocsClientId;
  const clientSecret = serverEnv.googleDocsClientSecret;
  if (!clientId || !clientSecret) return null;

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });

  if (!response.ok) return null;

  const result = (await response.json()) as { access_token?: string };
  return result.access_token ?? null;
}

export type CreatedGoogleDoc = { documentId: string; url: string };

/**
 * Upload a .docx and have Drive convert it into a Google Doc.
 *
 * Multipart upload: a JSON metadata part naming the target mime type, then the
 * file bytes. Setting `mimeType` to `application/vnd.google-apps.document` is
 * what triggers the conversion.
 */
export async function uploadDocxAsGoogleDoc(
  accessToken: string,
  name: string,
  bytes: Uint8Array,
): Promise<CreatedGoogleDoc | null> {
  const boundary = `journal-letter-${crypto.randomUUID()}`;

  const metadata = JSON.stringify({
    name,
    mimeType: "application/vnd.google-apps.document",
  });

  const encoder = new TextEncoder();
  const head = encoder.encode(
    `--${boundary}\r\n` +
      `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
      `${metadata}\r\n` +
      `--${boundary}\r\n` +
      `Content-Type: application/vnd.openxmlformats-officedocument.wordprocessingml.document\r\n\r\n`,
  );
  const tail = encoder.encode(`\r\n--${boundary}--\r\n`);

  const body = new Uint8Array(head.length + bytes.length + tail.length);
  body.set(head, 0);
  body.set(bytes, head.length);
  body.set(tail, head.length + bytes.length);

  const response = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": `multipart/related; boundary=${boundary}`,
      },
      body,
    },
  );

  if (!response.ok) return null;

  const result = (await response.json()) as { id?: string; webViewLink?: string };
  if (!result.id) return null;

  return {
    documentId: result.id,
    url: result.webViewLink ?? `https://docs.google.com/document/d/${result.id}/edit`,
  };
}
