const test = require("node:test");
const assert = require("node:assert/strict");
const { compareScans, alertsForChanges, summarize } = require("../src/modules/network/network.compare");

const obs = (deviceId, ipAddress, { identity = "ip", mac, hostname = null, ports = [] } = {}) => ({
    deviceId,
    identity,
    identityKey: identity === "mac" ? `mac:${mac}` : `ip:${ipAddress}`,
    ipAddress,
    hostname,
    ports: ports.map(([port, state, service = null]) => ({ port, protocol: "tcp", state, service })),
});

const types = (changes) => changes.map((c) => c.type).sort();

test("first scan is the baseline: no changes, no alerts", () => {
    const changes = compareScans(null, [obs("d1", "192.168.1.2", { ports: [[6379, "open"]] })], true);
    assert.deepEqual(changes, []);
    assert.deepEqual(alertsForChanges(changes), []);
});

test("new and missing devices on a COMPLETED scan", () => {
    const previous = [obs("d1", "192.168.1.2"), obs("d2", "192.168.1.3")];
    const current = [obs("d1", "192.168.1.2"), obs("d3", "192.168.1.9", { hostname: "tv.local" })];
    const changes = compareScans(previous, current, true);
    assert.deepEqual(types(changes), ["device_added", "device_not_seen"]);
    assert.equal(changes.find((c) => c.type === "device_not_seen").deviceId, "d2");
});

test("PARTIAL scans never report absences or closed ports", () => {
    const previous = [obs("d1", "192.168.1.2", { ports: [[80, "open"]] }), obs("d2", "192.168.1.3")];
    const current = [obs("d1", "192.168.1.2", { ports: [[80, "closed"]] })];
    assert.deepEqual(compareScans(previous, current, false), []);
    assert.deepEqual(types(compareScans(previous, current, true)), ["device_not_seen", "port_closed"]);
});

test("port opened: risky ports are high and alert, others low and don't", () => {
    const previous = [obs("d1", "192.168.1.2", { ports: [[80, "closed"]] })];
    const current = [obs("d1", "192.168.1.2", { ports: [[80, "open"], [445, "open", "smb"]] })];
    const changes = compareScans(previous, current, true);
    assert.deepEqual(changes.map((c) => [c.after.port, c.severity]), [[80, "low"], [445, "high"]]);

    const alerts = alertsForChanges(changes);
    assert.equal(alerts.length, 1);
    assert.equal(alerts[0].type, "network_port_opened");
    assert.equal(alerts[0].key, "network_port:ip:192.168.1.2:445/tcp");
});

test("port closed needs an explicit closed state", () => {
    const previous = [obs("d1", "192.168.1.2", { ports: [[22, "open"], [80, "open"]] })];
    const current = [obs("d1", "192.168.1.2", { ports: [[22, "filtered"]] })];
    assert.deepEqual(compareScans(previous, current, true), []);
});

test("MAC identity tracks IP changes; IP identity can't", () => {
    const previous = [obs("d1", "192.168.1.2", { identity: "mac", mac: "aa:bb:cc:dd:ee:ff" })];
    const current = [obs("d1", "192.168.1.7", { identity: "mac", mac: "aa:bb:cc:dd:ee:ff" })];
    const changes = compareScans(previous, current, true);
    assert.deepEqual(types(changes), ["device_ip_changed"]);
    assert.deepEqual(changes[0].after, { ipAddress: "192.168.1.7" });
});

test("hostname change, but a missing hostname is not a change", () => {
    const previous = [obs("d1", "192.168.1.2", { hostname: "old.local" })];
    assert.deepEqual(types(compareScans(previous, [obs("d1", "192.168.1.2", { hostname: "new.local" })], true)), ["device_hostname_changed"]);
    assert.deepEqual(compareScans(previous, [obs("d1", "192.168.1.2")], true), []);
});

test("new device alert key is stable per identity, so re-discovery doesn't re-alert", () => {
    const changes = compareScans([], [obs("d9", "192.168.1.50")], true);
    const [alert] = alertsForChanges(changes);
    assert.equal(alert.type, "network_device_discovered");
    assert.equal(alert.key, "network_device:ip:192.168.1.50");
});

test("summary counts", () => {
    const current = [obs("d1", "192.168.1.2", { ports: [[80, "open"], [22, "closed"]] }), obs("d2", "192.168.1.3")];
    const changes = compareScans([obs("d1", "192.168.1.2"), obs("d5", "192.168.1.5")], current, true);
    assert.deepEqual(summarize(current, changes, true), { devices: 2, newDevices: 1, notSeen: 1, openPorts: 1 });
    assert.equal(summarize(current, changes, false).notSeen, null);
});
