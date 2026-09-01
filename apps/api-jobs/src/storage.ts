/**
 * @sightforge/api-jobs - Pure WebCrypto S3 SigV4 Presigner for Cloudflare R2
 *
 * Generates secure, short-lived presigned PUT and GET URLs conforming to R18, R19, R50, and R73
 * without external AWS SDK dependencies.
 */

import { hmacSha256, hmacSha256Hex } from "@sightforge/worker-kit";

export interface PresignOptions {
  method: "PUT" | "GET";
  bucketName: string;
  objectKey: string;
  accessKeyId: string;
  secretAccessKey: string;
  accountId?: string;
  region?: string;
  expiresInSeconds?: number;
  contentType?: string;
  contentDisposition?: string;
  endpointOverride?: string;
}

/**
 * Computes SHA-256 hex hash of a string.
 */
async function sha256Hex(data: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(data),
  );
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Derives AWS SigV4 Signing Key.
 */
async function getSignatureKey(
  key: string,
  dateStamp: string,
  regionName: string,
  serviceName: string,
): Promise<Uint8Array> {
  const kDate = await hmacSha256("AWS4" + key, dateStamp);
  const kRegion = await hmacSha256(kDate, regionName);
  const kService = await hmacSha256(kRegion, serviceName);
  return hmacSha256(kService, "aws4_request");
}

/**
 * Generates an S3 SigV4 Presigned URL for Cloudflare R2 storage.
 */
export async function generatePresignedUrl(
  options: PresignOptions,
): Promise<string> {
  const {
    method,
    bucketName,
    objectKey,
    accessKeyId,
    secretAccessKey,
    accountId = "dummy_account_id",
    region = "auto",
    expiresInSeconds = 900, // 15 minutes default
    contentType,
    contentDisposition,
    endpointOverride,
  } = options;

  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);

  const host = endpointOverride
    ? new URL(endpointOverride).host
    : `${accountId}.r2.cloudflarestorage.com`;
  const endpointBase = endpointOverride || `https://${host}`;

  const cleanKey = objectKey.startsWith("/") ? objectKey.slice(1) : objectKey;
  const canonicalUri = `/${bucketName}/${cleanKey}`;

  // Headers to sign
  const signedHeadersList: string[] = ["host"];
  if (contentType && method === "PUT") {
    signedHeadersList.push("content-type");
  }
  signedHeadersList.sort();
  const signedHeaders = signedHeadersList.join(";");

  // Query parameters for SigV4
  const queryParams: Record<string, string> = {
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": `${accessKeyId}/${dateStamp}/${region}/s3/aws4_request`,
    "X-Amz-Date": amzDate,
    "X-Amz-Expires": String(expiresInSeconds),
    "X-Amz-SignedHeaders": signedHeaders,
  };

  if (contentDisposition && method === "GET") {
    queryParams["response-content-disposition"] = contentDisposition;
  }
  if (contentType && method === "GET") {
    queryParams["response-content-type"] = contentType;
  }

  // Build canonical query string (sorted alphabetically)
  const canonicalQueryString = Object.keys(queryParams)
    .sort()
    .map(
      (k) => `${encodeURIComponent(k)}=${encodeURIComponent(queryParams[k]!)}`,
    )
    .join("&");

  // Build canonical headers string
  let canonicalHeaders = "";
  if (signedHeadersList.includes("content-type") && contentType) {
    canonicalHeaders += `content-type:${contentType.trim().toLowerCase()}\n`;
  }
  canonicalHeaders += `host:${host.trim().toLowerCase()}\n`;

  // Payload hash is UNSIGNED-PAYLOAD for query presigning
  const payloadHash = "UNSIGNED-PAYLOAD";

  const canonicalRequest = [
    method,
    canonicalUri,
    canonicalQueryString,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");

  const hashedCanonicalRequest = await sha256Hex(canonicalRequest);

  const credentialScope = `${dateStamp}/${region}/s3/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    hashedCanonicalRequest,
  ].join("\n");

  const signingKey = await getSignatureKey(
    secretAccessKey,
    dateStamp,
    region,
    "s3",
  );
  const signature = await hmacSha256Hex(signingKey, stringToSign);

  return `${endpointBase}${canonicalUri}?${canonicalQueryString}&X-Amz-Signature=${signature}`;
}
