/**
 * @sightforge/worker-kit - IP Extraction & Network Prefix Normalization
 *
 * Extracts connecting IP from Cloudflare runtime headers and normalizes IPv6
 * to a /64 prefix to prevent residential rotation attacks per KTD6.
 */

/**
 * Normalizes an IP address to a network prefix.
 * - IPv4: returns the full 32-bit address.
 * - IPv6: returns the leading /64 network prefix.
 */
export function normalizeIpPrefix(ip: string): string {
  const trimmed = ip.trim();

  // IPv4 Address (e.g. 192.0.2.1)
  if (trimmed.includes(".")) {
    return trimmed;
  }

  // IPv6 Address (e.g. 2001:0db8:85a3:0000:0000:8a2e:0370:7334)
  if (trimmed.includes(":")) {
    const parts = trimmed.split(":");
    // Take the first 4 hextets (64 bits)
    const prefixParts = parts.slice(0, 4);
    while (prefixParts.length < 4) {
      prefixParts.push("0");
    }
    return `${prefixParts.join(":")}::/64`;
  }

  return trimmed || "127.0.0.1";
}

/**
 * Extracts and normalizes the client IP address from the platform-provided CF-Connecting-IP header.
 * Explicitly ignores spoofable X-Forwarded-For headers (KTD6).
 */
export function getClientIpPrefix(request: Request): string {
  const connectingIp = request.headers.get("CF-Connecting-IP") || "127.0.0.1";
  return normalizeIpPrefix(connectingIp);
}
