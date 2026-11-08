import { sanitizeUrl } from './helpers';

describe('sanitizeUrl', () => {
  test('normalizes valid scan URLs', () => {
    expect(sanitizeUrl('example.com')).toBe('https://example.com/');
    expect(sanitizeUrl('https://example.com/path?query=1')).toBe('https://example.com/path?query=1');
    expect(sanitizeUrl('http://8.8.8.8/status')).toBe('http://8.8.8.8/status');
  });

  test('rejects incomplete, private, and non-http scan URLs', () => {
    expect(sanitizeUrl('')).toBe('');
    expect(sanitizeUrl('not-a-url')).toBe('');
    expect(sanitizeUrl('https://example')).toBe('');
    expect(sanitizeUrl('ftp://example.com')).toBe('');
    expect(sanitizeUrl('http://localhost:3000')).toBe('');
    expect(sanitizeUrl('http://192.168.1.10')).toBe('');
    expect(sanitizeUrl('name@example.com')).toBe('');
  });

  test('limits the opt-in local prototype to its exact test origin', () => {
    const previous = process.env.REACT_APP_SCAN_AUTH_LOCAL_PROTOTYPE;
    try {
      process.env.REACT_APP_SCAN_AUTH_LOCAL_PROTOTYPE = 'false';
      expect(sanitizeUrl('http://localhost:4399/')).toBe('');
      process.env.REACT_APP_SCAN_AUTH_LOCAL_PROTOTYPE = 'true';
      expect(sanitizeUrl('http://localhost:4399/members')).toBe('http://localhost:4399/members');
      expect(sanitizeUrl('http://localhost:4400/')).toBe('');
      expect(sanitizeUrl('http://127.0.0.1:4399/')).toBe('');
      expect(sanitizeUrl('http://user:password@localhost:4399/')).toBe('');
    } finally {
      if (previous === undefined) delete process.env.REACT_APP_SCAN_AUTH_LOCAL_PROTOTYPE;
      else process.env.REACT_APP_SCAN_AUTH_LOCAL_PROTOTYPE = previous;
    }
  });
});
