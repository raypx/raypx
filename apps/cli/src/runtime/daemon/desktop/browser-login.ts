import { hostname } from "node:os";
import { randomBytes, timingSafeEqual } from "node:crypto";
import {
  desktopCallbackPath,
  desktopLoginAuthorizationSchema,
  desktopOAuthCodeSchema,
  oauthAuthorizePath,
  desktopLoginTokenSchema,
} from "@raypx/contracts/api";
import { LocalError } from "../../errors.js";
import { abortable } from "../cancellation.js";
import type { DesktopApi } from "./api.js";

const token = () => randomBytes(32).toString("base64url");
const expired = () => new LocalError("DESKTOP_LOGIN_EXPIRED", "Desktop login expired");
const unavailable = () => new LocalError("DESKTOP_LOGIN_UNAVAILABLE", "Desktop login unavailable");
const cancelled = () => new LocalError("DESKTOP_LOGIN_CANCELLED", "Desktop login cancelled");
const pageHeaders = {
  "Content-Type": "text/html; charset=utf-8",
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
  "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
  "X-Content-Type-Options": "nosniff",
};

type Attempt = {
  id: string;
  client: string;
  controller: AbortController;
  result: ReturnType<typeof Promise.withResolvers<true>>;
};

export class BrowserLogin {
  private current: Attempt | undefined;
  constructor(
    private readonly api: DesktopApi,
    private readonly commit: () => void,
  ) {}

  async start(input: { id: string; webOrigin: string }, client: string, parent: AbortSignal) {
    const { id, webOrigin } = input;
    if (this.current) throw new LocalError("DESKTOP_LOGIN_BUSY", "Desktop login already pending");
    const controller = new AbortController();
    const signal = AbortSignal.any([controller.signal, parent]);
    const result = Promise.withResolvers<true>();
    void result.promise.catch(() => {});
    const attempt = { id, client, controller, result };
    this.current = attempt;
    const timer = setTimeout(() => controller.abort(expired()), 5 * 60_000);
    timer.unref();
    let server: ReturnType<typeof Bun.serve> | undefined;
    const stopListener = () => {
      const listener = server;
      server = undefined;
      void listener?.stop().catch(() => {});
    };
    const abort = () => {
      clearTimeout(timer);
      stopListener();
      result.reject(signal.reason);
      if (this.current === attempt) this.current = undefined;
    };
    signal.addEventListener("abort", abort, { once: true });
    try {
      const state = token(),
        nonce = token(),
        verifier = token();
      const challenge = new Bun.CryptoHasher("sha256").update(verifier).digest("base64url");
      let received = false;
      const back = "Return to Raypx Desktop. / 请返回 Raypx 桌面端。";
      server = Bun.serve({
        hostname: "127.0.0.1",
        port: 0,
        maxRequestBodySize: 1024,
        idleTimeout: 5,
        fetch: async (request, listener) => {
          const url = new URL(request.url);
          const returnedState = desktopLoginTokenSchema.safeParse(url.searchParams.get("state"));
          const code = desktopOAuthCodeSchema.safeParse(url.searchParams.get("code"));
          const oauthError = url.searchParams.get("error");
          if (
            request.method !== "GET" ||
            url.pathname !== desktopCallbackPath ||
            url.search.length > 1024 ||
            url.searchParams.get("iss") !== this.api.cookies.origin.origin ||
            request.headers.get("host") !== `127.0.0.1:${listener.port}` ||
            received ||
            signal.aborted ||
            !returnedState.success ||
            !timingSafeEqual(Buffer.from(state), Buffer.from(returnedState.data)) ||
            (oauthError !== null) === code.success
          )
            return new Response(null, { status: 400, headers: pageHeaders });
          received = true;
          listener.timeout(request, 35);
          try {
            if (oauthError === "access_denied") throw cancelled();
            if (!code.success) throw unavailable();
            await this.api.browserLoginExchange(
              { code: code.data, verifier, redirectUri, nonce },
              signal,
              async () => {
                signal.throwIfAborted();
              },
              this.commit,
            );
            result.resolve(true);
          } catch (error) {
            result.reject(error);
          } finally {
            stopListener();
          }
          return new Response(`<meta charset="utf-8"><title>Raypx</title><p>${back}</p>`, {
            headers: pageHeaders,
          });
        },
      });
      const redirectUri = `http://127.0.0.1:${server.port}${desktopCallbackPath}`;
      const reply = await this.api.browserLoginStart(
        {
          redirectUri,
          state,
          nonce,
          challenge,
          webOrigin,
          device: hostname().trim().slice(0, 120) || "Raypx Desktop",
        },
        signal,
      );
      const parsed = desktopLoginAuthorizationSchema.safeParse(reply.body);
      if (!parsed.success || reply.response.status !== 200) throw unavailable();
      const authorization = new URL(parsed.data.authorizationUrl);
      if (
        authorization.origin !== this.api.cookies.origin.origin ||
        authorization.pathname !== oauthAuthorizePath ||
        authorization.username ||
        authorization.password ||
        authorization.hash
      )
        throw unavailable();
      return parsed.data;
    } catch (error) {
      const failure = signal.aborted ? signal.reason : error;
      controller.abort(failure);
      throw failure;
    }
  }

  async wait(id: string, client: string, signal: AbortSignal) {
    const attempt = this.current;
    if (attempt?.id !== id || attempt.client !== client) throw expired();
    try {
      return await abortable(signal, () => attempt.result.promise);
    } finally {
      if (this.current === attempt) {
        attempt.controller.abort(cancelled());
        this.current = undefined;
      }
    }
  }

  cancel(id?: string, client?: string) {
    const attempt = this.current;
    if (attempt && (id === undefined || (attempt.id === id && attempt.client === client))) {
      this.current = undefined;
      attempt.controller.abort(cancelled());
    }
    return true as const;
  }
}
