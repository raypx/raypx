interface WrappedDataKey {
  keyId: string;
  wrappedDataKey: string;
}
/** Implementations may delegate wrapping to an external key service. */
export interface SecretKeyProvider {
  wrap(this: void, dataKey: string, binding: string): Promise<WrappedDataKey>;
  unwrap(this: void, key: WrappedDataKey, binding: string): Promise<string>;
}
export interface SealedSecret extends WrappedDataKey {
  ciphertext: string;
}
export interface SecretStore {
  seal(this: void, accountId: string, secretId: string, value: string): Promise<SealedSecret>;
  read(this: void, accountId: string, connectionId: string, secretId: string): Promise<string>;
  /** Operator-owned key rotation; never exposed by the account API. */
  rewrap?(
    this: void,
    accountId: string,
    connectionId: string,
    secretId: string,
    next: SecretKeyProvider,
  ): Promise<void>;
}
