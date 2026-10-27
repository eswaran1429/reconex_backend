// IPv4 helpers for validating network profiles and uploaded scan results.
// Addresses are handled as unsigned 32-bit integers.

const PRIVATE_RANGES = ["10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16"];

// Smallest prefix accepted for a saved network: /22 = 1024 addresses.
const MIN_PREFIX = 22;
// /31 and /32 have no host addresses to scan.
const MAX_PREFIX = 30;

const parseIPv4 = (value) => {
    if (typeof value !== "string") return null;
    const parts = value.split(".");
    if (parts.length !== 4) return null;
    let result = 0;
    for (const part of parts) {
        if (!/^(0|[1-9]\d{0,2})$/.test(part)) return null;
        const octet = Number(part);
        if (octet > 255) return null;
        result = result * 256 + octet;
    }
    return result;
}

const formatIPv4 = (value) => [24, 16, 8, 0].map((shift) => (value >>> shift) & 255).join(".");

const maskFor = (prefix) => (prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0);

/** `"192.168.1.7/24"` -> `{ network, broadcast, prefix, cidr: "192.168.1.0/24" }`, or null. */
const parseCidr = (value) => {
    if (typeof value !== "string") return null;
    const match = /^([^/]+)\/(\d{1,2})$/.exec(value.trim());
    if (!match) return null;
    const address = parseIPv4(match[1]);
    const prefix = Number(match[2]);
    if (address === null || prefix > 32) return null;
    const mask = maskFor(prefix);
    const network = (address & mask) >>> 0;
    const broadcast = (network | (~mask >>> 0)) >>> 0;
    return { network, broadcast, prefix, cidr: `${formatIPv4(network)}/${prefix}` };
}

const privateRanges = PRIVATE_RANGES.map(parseCidr);

const isPrivateSubnet = (subnet) =>
    privateRanges.some((range) => subnet.prefix >= range.prefix && subnet.network >= range.network && subnet.broadcast <= range.broadcast);

/** Reason the subnet can't be saved, or null when it's acceptable. */
const subnetProblem = (value) => {
    const subnet = parseCidr(value);
    if (!subnet) return "Must be an IPv4 CIDR like 192.168.1.0/24";
    if (!isPrivateSubnet(subnet)) return "Must be a private range inside 10.0.0.0/8, 172.16.0.0/12 or 192.168.0.0/16";
    if (subnet.prefix < MIN_PREFIX) return `Prefix must be /${MIN_PREFIX} or smaller (at most 1024 addresses)`;
    if (subnet.prefix > MAX_PREFIX) return `Prefix must be /${MAX_PREFIX} or larger`;
    return null;
}

/** True for a host address inside the subnet (not the network or broadcast address). */
const isHostInSubnet = (ip, cidr) => {
    const address = parseIPv4(ip);
    const subnet = parseCidr(cidr);
    if (address === null || !subnet) return false;
    return address > subnet.network && address < subnet.broadcast;
}

const hostCount = (cidr) => {
    const subnet = parseCidr(cidr);
    return subnet ? Math.max(subnet.broadcast - subnet.network - 1, 0) : 0;
}

module.exports = {
    parseIPv4,
    formatIPv4,
    parseCidr,
    subnetProblem,
    isHostInSubnet,
    hostCount,
};
