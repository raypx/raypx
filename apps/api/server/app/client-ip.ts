import { BlockList, isIP } from "node:net";

/** Trust forwarding only when the actual socket peer belongs to the configured proxy set. */
export function createClientIpReader(headers: string[], proxies: string[]) {
  const block = new BlockList();
  const normalize = (ip: string) =>
    ip.startsWith("::ffff:") && isIP(ip.slice(7)) === 4 ? ip.slice(7) : ip;
  for (const proxy of proxies) {
    const [raw, bits] = proxy.split("/"),
      address = normalize(raw ?? ""),
      family = isIP(address);
    if (!family) throw new Error("Invalid trusted proxy configuration");
    if (bits === undefined) block.addAddress(address, family === 4 ? "ipv4" : "ipv6");
    else {
      const prefix = Number(bits);
      if (!/^\d+$/.test(bits) || prefix < 0 || prefix > (family === 4 ? 32 : 128))
        throw new Error("Invalid trusted proxy configuration");
      block.addSubnet(address, prefix, family === 4 ? "ipv4" : "ipv6");
    }
  }
  const trusted = (ip: string) => block.check(ip, isIP(ip) === 4 ? "ipv4" : "ipv6");
  return (rawPeer: string | undefined, incoming: Headers): string | null => {
    const peer = normalize(rawPeer ?? "");
    if (!isIP(peer)) return null;
    if (!trusted(peer)) return peer;
    for (const name of headers) {
      const value = incoming.get(name);
      if (!value || value.length > 8192) continue;
      const chain = value.split(",");
      if (chain.length > 32) continue;
      let client = peer;
      for (let index = chain.length - 1; index >= 0; index--) {
        // Stop at the first untrusted hop. Anything farther left is supplied by
        // that hop and must not invalidate the trusted suffix.
        if (!trusted(client)) return client;
        const raw = chain[index]!.trim();
        const bracketed = /^\[([^\]]+)\](?::\d+)?$/.exec(raw);
        const ipv4Port = /^(\d+\.\d+\.\d+\.\d+):\d+$/.exec(raw);
        const address = normalize(bracketed?.[1] ?? ipv4Port?.[1] ?? raw);
        if (!isIP(address)) return client;
        client = address;
      }
      return client;
    }
    return peer;
  };
}
