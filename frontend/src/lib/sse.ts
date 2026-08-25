/**
 * Minimal Server-Sent Events parser for `fetch`-based streams.
 *
 * Written against the SSE framing rules rather than "split on newline":
 *   - an event is a block of lines terminated by a blank line;
 *   - `event:` names it, `data:` lines accumulate and are joined with "\n";
 *   - lines may arrive split across network chunks, and the server may use
 *     CRLF line endings.
 *
 * Parsing line-by-line without honouring block boundaries mislabels any event
 * whose `event:` and `data:` lines land in different network chunks — which is
 * how a citation payload ends up rendered as answer text.
 */

export interface SSEEvent {
  event: string;
  data: string;
}

export class SSEParser {
  private buffer = '';

  /** Feed a decoded chunk; returns every complete event it contains. */
  push(chunk: string): SSEEvent[] {
    this.buffer += chunk;
    const events: SSEEvent[] = [];

    // Normalize CRLF so block splitting is uniform.
    this.buffer = this.buffer.replace(/\r\n/g, '\n');

    let boundary = this.buffer.indexOf('\n\n');
    while (boundary !== -1) {
      const block = this.buffer.slice(0, boundary);
      this.buffer = this.buffer.slice(boundary + 2);

      const parsed = this.parseBlock(block);
      if (parsed) events.push(parsed);

      boundary = this.buffer.indexOf('\n\n');
    }

    return events;
  }

  /** Flush a trailing event that arrived without its terminating blank line. */
  flush(): SSEEvent[] {
    const remaining = this.buffer.trim();
    this.buffer = '';
    if (!remaining) return [];
    const parsed = this.parseBlock(remaining);
    return parsed ? [parsed] : [];
  }

  private parseBlock(block: string): SSEEvent | null {
    let event = 'message';
    const dataLines: string[] = [];

    for (const line of block.split('\n')) {
      if (line.startsWith(':')) continue; // comment / keep-alive
      if (line.startsWith('event:')) {
        event = line.slice(6).trim();
      } else if (line.startsWith('data:')) {
        // Exactly one optional space after the colon is part of the framing.
        dataLines.push(line.startsWith('data: ') ? line.slice(6) : line.slice(5));
      }
    }

    if (!dataLines.length) return null;
    return { event, data: dataLines.join('\n') };
  }
}

/** Read a fetch Response body as a stream of parsed SSE events. */
export async function* readSSE(response: Response): AsyncGenerator<SSEEvent> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Response has no readable stream');

  const decoder = new TextDecoder();
  const parser = new SSEParser();

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      for (const event of parser.push(decoder.decode(value, { stream: true }))) {
        yield event;
      }
    }
    for (const event of parser.flush()) yield event;
  } finally {
    reader.releaseLock();
  }
}
