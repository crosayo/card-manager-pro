// 取得した応答の本文を、上限のバイト数までだけ読む（Wiki取込 /api/scrape。Q-2026-11-06-6）。
// Content-Length が上限を超えていれば読む前に、読みながら上限を超えたらその時点で中止して BodyTooLargeError を投げる。

export class BodyTooLargeError extends Error {
  constructor(public readonly limitBytes: number) {
    super(`response body exceeds ${limitBytes} bytes`);
    this.name = 'BodyTooLargeError';
  }
}

export async function readBodyWithLimit(res: Response, limitBytes: number): Promise<Uint8Array> {
  const declared = Number(res.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > limitBytes) {
    await res.body?.cancel().catch(() => {});
    throw new BodyTooLargeError(limitBytes);
  }
  if (!res.body) return new Uint8Array(await res.arrayBuffer());

  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limitBytes) {
      await reader.cancel().catch(() => {});
      throw new BodyTooLargeError(limitBytes);
    }
    chunks.push(value);
  }
  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}
