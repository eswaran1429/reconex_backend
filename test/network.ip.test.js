const test = require("node:test");
const assert = require("node:assert/strict");
const { parseIPv4, parseCidr, subnetProblem, isHostInSubnet, hostCount } = require("../src/modules/network/network.ip");

test("parseIPv4 accepts dotted quads only", () => {
    assert.equal(parseIPv4("192.168.1.25"), 3232235801);
    assert.equal(parseIPv4("0.0.0.0"), 0);
    for (const bad of ["256.1.1.1", "1.2.3", "1.2.3.4.5", "01.2.3.4", "a.b.c.d", "", " 1.2.3.4", null]) {
        assert.equal(parseIPv4(bad), null, `${bad} should be rejected`);
    }
});

test("parseCidr normalises to the network address", () => {
    assert.equal(parseCidr("192.168.1.77/24").cidr, "192.168.1.0/24");
    assert.equal(parseCidr("10.0.5.9/22").cidr, "10.0.4.0/22");
    assert.equal(parseCidr("192.168.1.0/33"), null);
    assert.equal(parseCidr("192.168.1.0"), null);
});

test("subnetProblem allows only small private ranges", () => {
    assert.equal(subnetProblem("192.168.1.0/24"), null);
    assert.equal(subnetProblem("10.20.0.0/22"), null);
    assert.equal(subnetProblem("172.16.4.0/24"), null);
    assert.equal(subnetProblem("172.31.255.0/30"), null);

    for (const [cidr, reason] of [
        ["8.8.8.0/24", "public"],
        ["172.32.0.0/24", "just outside 172.16/12"],
        ["127.0.0.0/24", "loopback"],
        ["169.254.169.0/24", "link-local / cloud metadata"],
        ["0.0.0.0/24", "this-network"],
        ["224.0.0.0/24", "multicast"],
        ["192.168.0.0/16", "too large"],
        ["10.0.0.0/21", "too large"],
        ["192.168.1.0/31", "no hosts"],
        ["not-a-cidr", "garbage"],
    ]) {
        assert.ok(subnetProblem(cidr), `${cidr} (${reason}) should be rejected`);
    }
});

test("isHostInSubnet excludes network and broadcast addresses", () => {
    assert.ok(isHostInSubnet("192.168.1.1", "192.168.1.0/24"));
    assert.ok(isHostInSubnet("192.168.1.254", "192.168.1.0/24"));
    assert.ok(!isHostInSubnet("192.168.1.0", "192.168.1.0/24"));
    assert.ok(!isHostInSubnet("192.168.1.255", "192.168.1.0/24"));
    assert.ok(!isHostInSubnet("192.168.2.5", "192.168.1.0/24"));
    assert.ok(!isHostInSubnet("169.254.169.254", "192.168.1.0/24"));
    assert.equal(hostCount("192.168.1.0/24"), 254);
});
