import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@voidmix/ui/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@voidmix/ui/components/ui/field";
import { Textarea } from "@voidmix/ui/textarea";

export interface ComposerProps {
  value: string;
  onValueChange(value: string): void;
  onSubmit(value: string): Promise<void>;
  pending?: boolean;
  disabledReason?: string;
  context?: string;
  labels: {
    label: string;
    placeholder: string;
    submit: string;
    submitting: string;
    failed: string;
    hint: string;
  };
}

export function Composer({
  value,
  onValueChange,
  onSubmit,
  pending = false,
  disabledReason,
  context,
  labels,
}: ComposerProps) {
  const id = useId();
  const composing = useRef(false);
  const locked = useRef(false);
  const mounted = useRef(true);
  const [submitting, setSubmitting] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const busy = pending || submitting;
  async function submit() {
    if (!value.trim() || busy || locked.current || disabledReason) return;
    locked.current = true;
    setSubmitting(true);
    setFailed(false);
    try {
      await onSubmit(value.trim());
    } catch {
      if (mounted.current) setFailed(true);
    } finally {
      locked.current = false;
      if (mounted.current) setSubmitting(false);
    }
  }
  return (
    <form
      className="agent-composer"
      aria-busy={busy}
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <FieldGroup>
        <Field data-invalid={failed || undefined} data-disabled={busy || Boolean(disabledReason)}>
          <FieldLabel htmlFor={id}>{labels.label}</FieldLabel>
          {context ? <p className="agent-context">{context}</p> : null}
          <Textarea
            id={id}
            value={value}
            onChange={(event) => onValueChange(event.target.value)}
            placeholder={labels.placeholder}
            required
            maxLength={65536}
            disabled={busy || Boolean(disabledReason)}
            aria-invalid={failed || undefined}
            aria-describedby={`${id}-hint${failed ? ` ${id}-error` : ""}`}
            onCompositionStart={() => {
              composing.current = true;
            }}
            onCompositionEnd={() => {
              composing.current = false;
            }}
            onKeyDown={(event) => {
              if (
                event.key === "Enter" &&
                !event.shiftKey &&
                !event.nativeEvent.isComposing &&
                !composing.current &&
                event.keyCode !== 229
              ) {
                event.preventDefault();
                void submit();
              }
            }}
          />
          <div className="agent-composer-footer">
            <p id={`${id}-hint`} className="agent-context">
              {disabledReason ?? labels.hint}
            </p>
            <Button type="submit" disabled={busy || !value.trim() || Boolean(disabledReason)}>
              {busy ? labels.submitting : labels.submit}
            </Button>
          </div>
          {failed ? <FieldError id={`${id}-error`}>{labels.failed}</FieldError> : null}
        </Field>
      </FieldGroup>
    </form>
  );
}
