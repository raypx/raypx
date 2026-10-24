/** The native bridge only accepts bounded calls to the packaged API origin. */
export interface DesktopApiRequest {
  path: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
}
export interface DesktopApiResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
}
