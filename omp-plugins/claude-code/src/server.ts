// Khoi dong HTTP server cho shim tren 127.0.0.1 dung Bun.serve hoac Node.js http
import http from "node:http";

export interface ServerHandle {
  port: number;
  stop: () => void;
}

declare const Bun:
  | {
      serve: (options: {
        hostname: string;
        port: number;
        fetch: (req: Request) => Response | Promise<Response>;
      }) => { port: number; stop: (closeActiveConnections?: boolean) => void };
    }
  | undefined;

declare global {
  // eslint-disable-next-line no-var
  var __claudeCodeShimServer: ServerHandle | undefined;
}

// Khoi dong server voi port uu tien 47120, fallback sang port ephemeral
export async function startShimServer(
  handler: (req: Request) => Promise<Response>
): Promise<ServerHandle> {
  // Dong server cu neu co singleton
  if (globalThis.__claudeCodeShimServer) {
    try {
      globalThis.__claudeCodeShimServer.stop();
    } catch {
      // Bo qua loi dong server cu
    }
    globalThis.__claudeCodeShimServer = undefined;
  }

  // Uu tien Bun.serve khi chay trong runtime OMP
  if (typeof Bun !== "undefined" && typeof Bun.serve === "function") {
    try {
      const bunServer = Bun.serve({
        hostname: "127.0.0.1",
        port: 47120,
        fetch: handler
      });
      const handle: ServerHandle = {
        port: bunServer.port,
        stop: () => bunServer.stop(true)
      };
      globalThis.__claudeCodeShimServer = handle;
      return handle;
    } catch {
      const fallbackServer = Bun.serve({
        hostname: "127.0.0.1",
        port: 0,
        fetch: handler
      });
      const handle: ServerHandle = {
        port: fallbackServer.port,
        stop: () => fallbackServer.stop(true)
      };
      globalThis.__claudeCodeShimServer = handle;
      return handle;
    }
  }

  // Fallback sang node:http khi chay test trong moi truong Node
  return new Promise<ServerHandle>((resolve, reject) => {
    const nodeServer = http.createServer((req, res) => {
      const url = `http://127.0.0.1:${(nodeServer.address() as { port: number })?.port || 0}${req.url}`;
      const chunks: Buffer[] = [];

      req.on("data", chunk => chunks.push(Buffer.from(chunk)));
      req.on("end", async () => {
        const bodyBuffer = Buffer.concat(chunks);
        const headers = new Headers();
        for (const [k, v] of Object.entries(req.headers)) {
          if (typeof v === "string") headers.set(k, v);
          else if (Array.isArray(v)) {
            for (const item of v) headers.append(k, item);
          }
        }

        const requestInit: RequestInit = {
          method: req.method,
          headers,
          body: req.method !== "GET" && req.method !== "HEAD" ? bodyBuffer : undefined
        };

        try {
          const webReq = new Request(url, requestInit);
          const webRes = await handler(webReq);

          res.statusCode = webRes.status;
          webRes.headers.forEach((val, key) => {
            res.setHeader(key, val);
          });

          if (webRes.body) {
            const reader = webRes.body.getReader();
            const pump = async () => {
              const { done, value } = await reader.read();
              if (done) {
                res.end();
                return;
              }
              res.write(value);
              await pump();
            };
            await pump();
          } else {
            res.end();
          }
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          res.statusCode = 500;
          res.end(msg);
        }
      });
    });

    nodeServer.listen(47120, "127.0.0.1", () => {
      const addr = nodeServer.address() as { port: number };
      const handle: ServerHandle = {
        port: addr.port,
        stop: () => nodeServer.close()
      };
      globalThis.__claudeCodeShimServer = handle;
      resolve(handle);
    });

    nodeServer.on("error", () => {
      // Thu lai voi port 0
      nodeServer.listen(0, "127.0.0.1", () => {
        const addr = nodeServer.address() as { port: number };
        const handle: ServerHandle = {
          port: addr.port,
          stop: () => nodeServer.close()
        };
        globalThis.__claudeCodeShimServer = handle;
        resolve(handle);
      });
    });
  });
}
