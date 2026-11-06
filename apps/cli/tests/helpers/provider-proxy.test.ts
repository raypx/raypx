import { BlockList } from "node:net";
import { expect, it } from "vite-plus/test";
import { windowsProviderBlockedSubnets } from "./provider-proxy";

it("blocks provider egress outside the IPv4 loopback proxy", () => {
  const ipv4 = new BlockList();
  const ipv6 = new BlockList();
  for (const subnet of windowsProviderBlockedSubnets) {
    const [address, prefix] = subnet.split("/");
    expect(Number(prefix)).toBeGreaterThan(0);
    if (address!.includes(":")) ipv6.addSubnet(address!, Number(prefix), "ipv6");
    else ipv4.addSubnet(address!, Number(prefix), "ipv4");
  }
  for (let first = 0; first < 256; first++) {
    for (const tail of ["0.0.0", "0.0.1", "128.128.128", "255.255.255"])
      expect(ipv4.check(`${first}.${tail}`, "ipv4")).toBe(first !== 127);
  }
  for (const address of ["::", "::1", "2001:db8::1", "fc00::1", "fe80::1", "ffff:ffff::1"])
    expect(ipv6.check(address, "ipv6")).toBe(true);
});
