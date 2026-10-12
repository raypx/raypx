import { createSerializationAdapter } from "@tanstack/react-router";
import { readErrorCode, readErrorDetails } from "@voidmix/i18n";

type ApiRouteError = Error & { code: string };

// The default Error serializer drops custom properties. Carry only the public
// error code across SSR, never server messages, stacks, causes or request data.
export const routeErrorAdapter = createSerializationAdapter<ApiRouteError, string>({
  key: "voidmix-api-route-error",
  test: (value): value is ApiRouteError =>
    value instanceof Error && readErrorCode(value) !== undefined,
  toSerializable: (error) => readErrorDetails(error)?.code ?? error.code,
  fromSerializable: (code) => Object.assign(new Error(), { code }),
});
