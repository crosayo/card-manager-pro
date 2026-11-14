import { describe, expect, it } from 'vitest';
import { buildSecretUrl, takeSecretParam } from './urlSecret';

describe('takeSecretParam', () => {
  it('fragment（新しい形式）から読み、URL から消す', () => {
    expect(takeSecretParam('https://x.test/#invite=abc123', 'invite')).toEqual({ value: 'abc123', cleanedUrl: '/' });
    expect(takeSecretParam('https://x.test/requests#token=a-b-c', 'token')).toEqual({ value: 'a-b-c', cleanedUrl: '/requests' });
  });

  it('query（以前の形式）からも読み、URL から消す', () => {
    expect(takeSecretParam('https://x.test/?invite=abc', 'invite')).toEqual({ value: 'abc', cleanedUrl: '/' });
    expect(takeSecretParam('https://x.test/requests?token=t1&x=1', 'token')).toEqual({ value: 't1', cleanedUrl: '/requests?x=1' });
  });

  it('ほかの query・fragment は残す', () => {
    expect(takeSecretParam('https://x.test/inventory?category=A#invite=c&tab=2', 'invite'))
      .toEqual({ value: 'c', cleanedUrl: '/inventory?category=A#tab=2' });
    expect(takeSecretParam('https://x.test/inventory#section', 'invite')).toEqual({ value: null, cleanedUrl: null });
  });

  it('両方にあれば fragment を使い、両方とも消す', () => {
    expect(takeSecretParam('https://x.test/?invite=old#invite=new', 'invite')).toEqual({ value: 'new', cleanedUrl: '/' });
  });

  it('空の値は使わないが URL からは消す', () => {
    expect(takeSecretParam('https://x.test/#invite=', 'invite')).toEqual({ value: null, cleanedUrl: '/' });
    expect(takeSecretParam('https://x.test/?invite=%20', 'invite')).toEqual({ value: null, cleanedUrl: '/' });
  });

  it('URL エンコードされた値を戻す', () => {
    expect(takeSecretParam('https://x.test/#token=a%2Bb', 'token').value).toBe('a+b');
  });

  it('何もなければ変えない', () => {
    expect(takeSecretParam('https://x.test/requests', 'token')).toEqual({ value: null, cleanedUrl: null });
  });
});

describe('buildSecretUrl', () => {
  it('fragment の形で作り、takeSecretParam で読み戻せる', () => {
    const url = buildSecretUrl('https://x.test', '/requests', 'token', 'a+b c');
    expect(url).toBe('https://x.test/requests#token=a%2Bb%20c');
    expect(takeSecretParam(url, 'token').value).toBe('a+b c');
  });
});
