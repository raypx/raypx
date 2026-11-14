import { deflateSync } from "node:zlib";
import type { ComputerScreenFrame } from "@raypx/core/computers";

function chunk(name: string, value: Buffer) {
  const type = Buffer.from(name);
  const payload = Buffer.concat([type, value]);
  let crc = 0xffffffff;
  for (const byte of payload) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  const header = Buffer.alloc(4);
  header.writeUInt32BE(value.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
  return Buffer.concat([header, payload, checksum]);
}

/** A real, deterministic PNG; no image renderer or host execution is involved. */
export function fakeScreen(sequence: number, revision: number): ComputerScreenFrame {
  const width = 1024;
  const height = 768;
  const stride = width * 3 + 1;
  const pixels = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let color = 236;
      if (x > 64 && x < 960 && y > 64 && y < 704) color = 255;
      if (x > 64 && x < 960 && y > 64 && y < 104) color = 45;
      if (x > 96 && x < 928 && y > 144 && y < 624) color = 247;
      if (x > 112 && x < 112 + Math.min(800, 24 + revision * 12) && y > 164 && y < 180)
        color = 68 + (revision % 8) * 8;
      const offset = y * stride + 1 + x * 3;
      pixels[offset] = color;
      pixels[offset + 1] = color;
      pixels[offset + 2] = color;
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 2;
  const bytes = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(pixels)),
    chunk("IEND", Buffer.alloc(0)),
  ]).toString("base64");
  return { sequence, width, height, mimeType: "image/png", bytes };
}
