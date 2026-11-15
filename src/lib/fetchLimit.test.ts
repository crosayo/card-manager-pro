import { describe, expect, it } from 'vitest';
import { BodyTooLargeError, readBodyWithLimit } from './fetchLimit';

const streamOf = (chunks: number[]) =>
  new ReadableStream<Uint8Array>({
    start(controller) {
      for (const n of chunks) controller.enqueue(new Uint8Array(n).fill(65));
      controller.close();
    },
  });

describe('readBodyWithLimit', () => {
  it('上限以内なら全部読む', async () => {
    const body = await readBodyWithLimit(new Response(streamOf([3, 4])), 7);
    expect(body.byteLength).toBe(7);
    expect(new TextDecoder().decode(body)).toBe('AAAAAAA');
  });

  it('読みながら上限を超えたら中止する', async () => {
    await expect(readBodyWithLimit(new Response(streamOf([5, 5])), 7)).rejects.toBeInstanceOf(BodyTooLargeError);
  });

  it('Content-Length が上限を超えていれば読む前に中止する', async () => {
    const res = new Response('0123456789', { headers: { 'content-length': '10' } });
    await expect(readBodyWithLimit(res, 5)).rejects.toBeInstanceOf(BodyTooLargeError);
  });

  it('本文がなければ空', async () => {
    expect((await readBodyWithLimit(new Response(null), 5)).byteLength).toBe(0);
  });
});
