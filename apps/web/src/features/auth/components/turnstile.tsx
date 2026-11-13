import { useEffect, useRef, useState } from "react";
import { Button } from "@raypx/ui/components/ui/button";
import { useTranslations } from "../../../i18n.js";

type Turnstile = {
  render(
    element: HTMLElement,
    options: {
      sitekey: string;
      action: string;
      size: "flexible";
      callback: (token: string) => void;
      "expired-callback": () => void;
      "error-callback": () => void;
    },
  ): string;
  remove(id: string): void;
};
type TurnstileWindow = Window & { turnstile?: Turnstile };
let loading: Promise<Turnstile> | undefined;

function loadTurnstile() {
  const browser = window as TurnstileWindow;
  if (browser.turnstile) return Promise.resolve(browser.turnstile);
  loading ??= new Promise<Turnstile>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    script.async = true;
    function fail() {
      script.remove();
      loading = undefined;
      reject(new Error("Could not load Turnstile"));
    }
    script.addEventListener(
      "load",
      () => {
        if (browser.turnstile) resolve(browser.turnstile);
        else fail();
      },
      { once: true },
    );
    script.addEventListener("error", fail, { once: true });
    document.head.append(script);
  });
  return loading;
}

export function TurnstileChallenge({
  siteKey,
  onToken,
}: {
  siteKey: string;
  onToken: (token: string) => void;
}) {
  const element = useRef<HTMLDivElement>(null);
  const [attempt, setAttempt] = useState(0);
  const [failed, setFailed] = useState(false);
  const t = useTranslations("auth");
  const c = useTranslations("common");
  useEffect(() => {
    const container = element.current;
    if (!container) return;
    let active = true;
    let dispose: (() => void) | undefined;
    void loadTurnstile()
      .then((turnstile) => {
        if (!active) return;
        const id = turnstile.render(container, {
          sitekey: siteKey,
          action: "email-code",
          size: "flexible",
          callback: (token) => {
            if (active) {
              setFailed(false);
              onToken(token);
            }
          },
          "expired-callback": () => {
            if (active) onToken("");
          },
          "error-callback": () => {
            if (active) {
              onToken("");
              setFailed(true);
            }
          },
        });
        dispose = () => turnstile.remove(id);
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
      dispose?.();
    };
  }, [attempt, onToken, siteKey]);
  return (
    <>
      <div ref={element} />
      {failed && (
        <div className="flex items-center gap-2">
          <p role="alert" className="text-sm">
            {t("methods.challengeFailed")}
          </p>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setFailed(false);
              setAttempt((value) => value + 1);
            }}
          >
            {c("retry")}
          </Button>
        </div>
      )}
    </>
  );
}
