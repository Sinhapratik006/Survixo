/**
 * The base-URL field is filled in the exact shapes sellers actually type:
 * bare hosts from provider docs, wrapped pastes, missing schemes. The schema
 * must normalise those instead of bouncing a usable value back as
 * "API base URL must start with http:// or https://" on every keystroke.
 */
import { describe, expect, it } from 'vitest';

const { optionalBaseUrl } = await import('../../src/routes/marketplace.js');

describe('optionalBaseUrl', () => {
  it('defaults bare hosts to https', () => {
    expect(optionalBaseUrl.parse('api.openai.com/v1')).toBe('https://api.openai.com/v1');
    expect(optionalBaseUrl.parse('openrouter.ai/api/v1')).toBe('https://openrouter.ai/api/v1');
    expect(optionalBaseUrl.parse('integrate.api.nvidia.com/v1')).toBe('https://integrate.api.nvidia.com/v1');
    expect(optionalBaseUrl.parse('api.openai.com:8080/v1')).toBe('https://api.openai.com:8080/v1');
  });

  it('keeps an explicit scheme as typed and strips trailing slashes', () => {
    expect(optionalBaseUrl.parse('https://api.openai.com/v1')).toBe('https://api.openai.com/v1');
    expect(optionalBaseUrl.parse('https://api.openai.com/v1/')).toBe('https://api.openai.com/v1');
    expect(optionalBaseUrl.parse('HTTP://api.openai.com/v1')).toBe('HTTP://api.openai.com/v1');
    expect(optionalBaseUrl.parse('http://192.168.1.10:8080/v1')).toBe('http://192.168.1.10:8080/v1');
  });

  it('uses http for loopback-style targets', () => {
    expect(optionalBaseUrl.parse('localhost:11434')).toBe('http://localhost:11434');
    expect(optionalBaseUrl.parse('127.0.0.1:9099/v1')).toBe('http://127.0.0.1:9099/v1');
    expect(optionalBaseUrl.parse('[::1]:11434')).toBe('http://[::1]:11434');
  });

  it('repairs wrapped pastes with stray line breaks', () => {
    expect(optionalBaseUrl.parse('  https://api.openai.com/v1  ')).toBe('https://api.openai.com/v1');
    expect(optionalBaseUrl.parse('https://api.openai.com/\nv1')).toBe('https://api.openai.com/v1');
    expect(optionalBaseUrl.parse('//api.openai.com/v1')).toBe('https://api.openai.com/v1');
  });

  it('treats empty and whitespace-only values as absent', () => {
    expect(optionalBaseUrl.parse('')).toBeUndefined();
    expect(optionalBaseUrl.parse('   ')).toBeUndefined();
    expect(optionalBaseUrl.parse(undefined)).toBeUndefined();
  });

  it('still rejects unusable values', () => {
    expect(() => optionalBaseUrl.parse('ftp://files.example.com')).toThrow(/http:\/\/ or https:\/\//);
    expect(() => optionalBaseUrl.parse('javascript:alert(1)')).toThrow();
    expect(() => optionalBaseUrl.parse('not a url at all')).toThrow();
    expect(() => optionalBaseUrl.parse('x'.repeat(400))).toThrow();
  });
});
