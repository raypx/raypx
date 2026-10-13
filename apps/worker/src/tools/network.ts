// Network tools removed - pi SDK dependency eliminated
// TODO: Re-implement these tools when AI package is rebuilt
//
// export { isPublicAddress, validateSourceUrl, readPublicSource, searchWeb } from "@raypx/ai";

export function isPublicAddress(): never {
  throw new Error("Network tools not available - AI package removed");
}

export function validateSourceUrl(): never {
  throw new Error("Network tools not available - AI package removed");
}

export function readPublicSource(): never {
  throw new Error("Network tools not available - AI package removed");
}

export function searchWeb(): never {
  throw new Error("Network tools not available - AI package removed");
}
