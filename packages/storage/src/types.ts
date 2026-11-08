export type ObjectBody = Uint8Array | ArrayBuffer | Blob | string;

export interface PutObjectOptions {
  contentType?: string;
  cacheControl?: string;
  contentDisposition?: string;
  /** Stored as `x-amz-meta-*` headers by S3; drivers without metadata ignore it. */
  metadata?: Record<string, string>;
}

export interface SignedUrlOptions {
  method: "GET" | "PUT";
  /** Seconds, 1 to 604800 (seven days, the S3 maximum). */
  expiresIn: number;
  /** Binds a PUT to this Content-Type; the uploader must send the same header. */
  contentType?: string;
}

export type StorageErrorCode =
  | "STORAGE_NOT_CONFIGURED"
  | "STORAGE_UNAVAILABLE"
  | "STORAGE_SIGNING_UNSUPPORTED"
  | "INVALID_OBJECT_KEY"
  | "INVALID_INPUT";

/** Object keys are `/`-separated segments of letters, digits and `! - _ . * ' ( )`. */
export interface ObjectStorage {
  readonly available: boolean;
  put(this: void, key: string, body: ObjectBody, options?: PutObjectOptions): Promise<void>;
  /** Resolves null when the object does not exist. */
  get(this: void, key: string): Promise<Uint8Array | null>;
  getStream(this: void, key: string): Promise<ReadableStream<Uint8Array> | null>;
  has(this: void, key: string): Promise<boolean>;
  delete(this: void, key: string): Promise<void>;
  /** Every key below a directory prefix, or the whole store without one. */
  list(this: void, prefix?: string): Promise<string[]>;
  /** Pre-signed URL for direct browser transfers; S3 storages only. */
  signedUrl(this: void, key: string, options: SignedUrlOptions): Promise<string>;
}
