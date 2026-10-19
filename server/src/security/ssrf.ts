import { lookup as dnsLookup, promises as dns, type LookupAddress } from 'node:dns';
import { isIP } from 'node:net';
import ipaddr from 'ipaddr.js';
import { Agent, fetch as undiciFetch, type RequestInit as UndiciRequestInit, type Response as UndiciResponse } from 'undici';
import { env } from '../config/env.js';

export class SsrfError extends Error {
  code = 'unsafe_url';
}

const BLOCKED_HOSTNAMES = [/^localhost$/i, /\.localhost$/i, /^metadata\.google\.internal$/i, /^metadata$/i, /\.internal$/i, /\.local$/i];

export interface UrlPolicy {
  allowHttp?: boolean;
  allowlist?: string[];
}

function defaultPolicy(): Required<UrlPolicy> {
  return { allowHttp: env.ALLOW_INSECURE_ENDPOINTS, allowlist: env.PRIVATE_ENDPOINT_ALLOWLIST };
}

/** Only globally routable unicast addresses are allowed. */
export function isPublicAddress(address: string): boolean {
  if (!ipaddr.isValid(address)) return false;
  let parsed = ipaddr.parse(address);
  if (parsed.kind() === 'ipv6') {
    const v6 = parsed as ipaddr.IPv6;
    if (v6.isIPv4MappedAddress()) parsed = v6.toIPv4Address();
  }
  const range = parsed.range();
  if (range !== 'unicast') return false;
  if (parsed.kind() === 'ipv6') {
    // Block documentation, NAT64 and 6to4/teredo prefixes which can embed private IPv4 targets.
    const text = parsed.toNormalizedString();
    if (/^2001:(0)?db8:/i.test(text) || /^64:ff9b:/i.test(text) || /^2002:/i.test(text) || /^2001:0:/i.test(text))
      return false;
  } else {
    const v4 = parsed as ipaddr.IPv4;
    // Extra IPv4 ranges not covered by ipaddr.js classifications.
    const extra: Array<[string, number]> = [
      ['0.0.0.0', 8],
      ['100.64.0.0', 10],
      ['192.0.0.0', 24],
      ['198.18.0.0', 15],
      ['169.254.0.0', 16],
    ];
    if (extra.some(([net, bits]) => v4.match(ipaddr.IPv4.parse(net), bits))) return false;
  }
  return true;
}

function isAllowlisted(hostname: string, policy: Required<UrlPolicy>) {
  return policy.allowlist.some((h) => h.toLowerCase() === hostname.toLowerCase());
}

/**
 * Validate a user-supplied outbound URL (seller endpoints, webhook targets).
 * Resolves DNS and rejects private, loopback, link-local, metadata and other
 * non-public destinations. Connection-time checks in `safeFetch` repeat the
 * address validation to defeat DNS rebinding.
 */
export async function validateOutboundUrl(raw: string, policyIn: UrlPolicy = {}): Promise<URL> {
  const policy = { ...defaultPolicy(), ...policyIn };
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new SsrfError('URL is not valid');
  }
  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  const allowlisted = isAllowlisted(hostname, policy);

  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && (policy.allowHttp || allowlisted)))
    throw new SsrfError('Only https:// URLs are allowed');
  if (url.username || url.password) throw new SsrfError('URLs must not contain credentials');
  if (url.hash) throw new SsrfError('URLs must not contain a fragment');
  if (allowlisted) return url;
  if (BLOCKED_HOSTNAMES.some((re) => re.test(hostname))) throw new SsrfError('This hostname is not allowed');

  if (isIP(hostname)) {
    if (!isPublicAddress(hostname)) throw new SsrfError('Private, loopback and reserved addresses are not allowed');
    return url;
  }

  let addresses: string[];
  try {
    const results = await dns.lookup(hostname, { all: true, verbatim: true });
    addresses = results.map((r) => r.address);
  } catch {
    throw new SsrfError('Hostname could not be resolved');
  }
  if (!addresses.length) throw new SsrfError('Hostname could not be resolved');
  if (addresses.some((a) => !isPublicAddress(a)))
    throw new SsrfError('Hostname resolves to a private or reserved address');
  return url;
}

type LookupCallback = (err: NodeJS.ErrnoException | null, address: string | LookupAddress[], family?: number) => void;

function guardedLookup(allowlist: string[]) {
  return (hostname: string, options: { all?: boolean } & Record<string, unknown>, callback: LookupCallback) => {
    dnsLookup(hostname, { ...options, all: true }, (err, addresses) => {
      if (err) return callback(err, '');
      const list = addresses as LookupAddress[];
      const allow = allowlist.some((h) => h.toLowerCase() === hostname.toLowerCase());
      const safe = allow ? list : list.filter((a) => isPublicAddress(a.address));
      if (!safe.length || (!allow && safe.length !== list.length)) {
        const e = new Error(`Blocked connection to non-public address for ${hostname}`) as NodeJS.ErrnoException;
        e.code = 'EBLOCKED';
        return callback(e, '');
      }
      if (options.all) return callback(null, safe);
      return callback(null, safe[0]!.address, safe[0]!.family);
    });
  };
}

let agent: Agent | undefined;
function getAgent() {
  agent ??= new Agent({
    connect: { lookup: guardedLookup(env.PRIVATE_ENDPOINT_ALLOWLIST), timeout: 10_000 } as never,
    headersTimeout: 120_000,
    bodyTimeout: 120_000,
  });
  return agent;
}

export interface SafeFetchOptions extends Omit<UndiciRequestInit, 'dispatcher' | 'redirect' | 'signal'> {
  /**
   * Abort signal controlling the whole exchange (headers and body). Callers
   * own the deadline so that streaming bodies can be bounded too.
   */
  signal: AbortSignal;
  policy?: UrlPolicy;
}

/**
 * Outbound fetch for untrusted destinations: URL validation, connect-time IP
 * checks (DNS-rebinding safe), and no redirect following.
 */
export async function safeFetch(url: string, opts: SafeFetchOptions): Promise<UndiciResponse> {
  const target = await validateOutboundUrl(url, opts.policy);
  const { policy: _policy, ...init } = opts;
  const res = await undiciFetch(target, { ...init, redirect: 'manual', dispatcher: getAgent() });
  if (res.status >= 300 && res.status < 400) {
    await res.body?.cancel().catch(() => undefined);
    throw new SsrfError('Redirects are not followed for security reasons');
  }
  return res;
}

export function deadline(ms: number): { signal: AbortSignal; clear: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error(`Timed out after ${ms}ms`)), ms);
  return { signal: controller.signal, clear: () => clearTimeout(timer) };
}

/** Read a response body as text with a byte cap. */
export async function readCapped(res: UndiciResponse, maxBytes: number): Promise<string> {
  if (!res.body) return '';
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw new Error('Response body too large');
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString('utf8');
}
