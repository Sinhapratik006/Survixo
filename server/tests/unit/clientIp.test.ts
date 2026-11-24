import { describe, expect, it } from 'vitest';
import type { Request } from 'express';
import { clientIp } from '../../src/security/clientIp.js';
import { ipKey } from '../../src/middleware/rateLimit.js';

const req = (ip: string | undefined, xff?: string | string[]) =>
  ({ ip, headers: xff === undefined ? {} : { 'x-forwarded-for': xff } }) as unknown as Request;

describe('clientIp', () => {
  it('uses the original client from X-Forwarded-For behind a proxy', () => {
    // Render/Vercel: the socket is the proxy's private address.
    expect(clientIp(req('10.0.12.7', '203.0.113.5'))).toBe('203.0.113.5');
    // Vercel rewrite -> Render: client first, Vercel egress appended.
    expect(clientIp(req('10.0.12.7', '203.0.113.5, 76.76.21.9'))).toBe('203.0.113.5');
  });

  it('gives different visitors behind the same proxy different keys', () => {
    expect(ipKey(req('10.0.12.7', '203.0.113.5'))).not.toBe(ipKey(req('10.0.12.7', '198.51.100.20')));
  });

  it('falls back to the socket address when the header is missing or not public', () => {
    expect(clientIp(req('203.0.113.9'))).toBe('203.0.113.9');
    expect(clientIp(req('203.0.113.9', '10.1.2.3'))).toBe('203.0.113.9');
    expect(clientIp(req('203.0.113.9', 'not-an-ip'))).toBe('203.0.113.9');
    expect(clientIp(req('203.0.113.9', '127.0.0.1'))).toBe('203.0.113.9');
  });

  it('normalises ports and IPv4-mapped IPv6', () => {
    expect(clientIp(req('10.0.0.1', '203.0.113.5:4433'))).toBe('203.0.113.5');
    expect(clientIp(req('::ffff:203.0.113.7'))).toBe('203.0.113.7');
    expect(clientIp(req('10.0.0.1', '2001:db8::1'))).toBe('2001:db8::1');
  });

  it('handles a repeated header', () => {
    expect(clientIp(req('10.0.0.1', ['203.0.113.5', '76.76.21.9']))).toBe('203.0.113.5');
  });
});
