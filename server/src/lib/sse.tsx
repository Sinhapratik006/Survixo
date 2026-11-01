import type { Request, Response } from 'express';
import type { StreamSink } from '../services/inference.js';

/** Server-Sent Events sink compatible with the OpenAI streaming format. */
export function createSseSink(req: Request, res: Response): StreamSink {
  let closed = false;
  const listeners: Array<() => void> = [];
  res.on('close', () => {
    if (!res.writableFinished) {
      closed = true;
      listeners.forEach((cb) => cb());
    }
  });
  return {
    start(headers) {
      if (res.headersSent) return;
      res.status(200);
      res.setHeader('content-type', 'text/event-stream; charset=utf-8');
      res.setHeader('cache-control', 'no-cache, no-transform');
      res.setHeader('connection', 'keep-alive');
      res.setHeader('x-accel-buffering', 'no');
      for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
      res.flushHeaders();
    },
    send(data) {
      if (closed) return;
      res.write(`data: ${typeof data === 'string' ? data : JSON.stringify(data)}\n\n`);
    },
    end() {
      if (!closed) res.end();
      closed = true;
    },
    isClosed: () => closed || req.destroyed,
    onClose(cb) {
      listeners.push(cb);
    },
  };
}
