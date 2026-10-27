const test = require("node:test");
const assert = require("node:assert/strict");
const { addBody, resultsBody, completeBody, changeQuery } = require("../src/modules/network/network.schemas");
const { networkId, scanId } = require("../src/modules/network/network.schemas");

const device = (overrides = {}) => ({
    ipAddress: "192.168.1.25",
    discoveryMethod: "tcp_probe",
    ports: [{ port: 80, state: "open" }],
    ...overrides,
});

test("add network rejects public and oversized subnets", () => {
    assert.ok(addBody.safeParse({ name: "Home", subnet: "192.168.1.0/24" }).success);
    assert.ok(!addBody.safeParse({ name: "Home", subnet: "8.8.8.0/24" }).success);
    assert.ok(!addBody.safeParse({ name: "Home", subnet: "10.0.0.0/8" }).success);
    assert.ok(!addBody.safeParse({ name: "", subnet: "192.168.1.0/24" }).success);
});

test("results: valid upload passes, protocol defaults to tcp, MAC is lower-cased", () => {
    const parsed = resultsBody.parse({ devices: [device({ macAddress: "AA:BB:CC:DD:EE:FF" })] });
    assert.equal(parsed.devices[0].ports[0].protocol, "tcp");
    assert.equal(parsed.devices[0].macAddress, "aa:bb:cc:dd:ee:ff");
});

test("results: rejects ports outside the allow-list, bad states, bad MACs, too many devices", () => {
    assert.ok(!resultsBody.safeParse({ devices: [device({ ports: [{ port: 31337, state: "open" }] })] }).success);
    assert.ok(!resultsBody.safeParse({ devices: [device({ ports: [{ port: 80, state: "vulnerable" }] })] }).success);
    assert.ok(!resultsBody.safeParse({ devices: [device({ macAddress: "not-a-mac" })] }).success);
    assert.ok(!resultsBody.safeParse({ devices: [device({ ipAddress: "999.1.1.1" })] }).success);
    assert.ok(!resultsBody.safeParse({ devices: [device({ discoveryMethod: "camera" })] }).success);
    assert.ok(!resultsBody.safeParse({ devices: Array.from({ length: 65 }, (_, i) => device({ ipAddress: `192.168.1.${i + 1}` })) }).success);
});

test("complete: only final statuses", () => {
    assert.ok(completeBody.safeParse({ status: "PARTIAL", error: "Wi-Fi dropped" }).success);
    assert.ok(!completeBody.safeParse({ status: "RUNNING" }).success);
});

test("ids must carry the right prefix", () => {
    assert.ok(networkId.safeParse({ id: "network_1" }).success);
    assert.ok(!networkId.safeParse({ id: "network_scan_1" }).success);
    assert.ok(scanId.safeParse({ id: "network_scan_3" }).success);
    assert.ok(!scanId.safeParse({ id: "scan_3" }).success);
    assert.ok(!changeQuery.safeParse({ scanId: "scan_3" }).success);
});
