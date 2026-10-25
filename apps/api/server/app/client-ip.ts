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
      const chain = value.split(",").map((ip) => normalize(ip.trim()));
      if (chain.length > 32 || chain.some((ip) => !isIP(ip))) continue;
      for (const ip of chain.reverse()) if (!trusted(ip)) return ip;
    }
    return peer;
  };
}
