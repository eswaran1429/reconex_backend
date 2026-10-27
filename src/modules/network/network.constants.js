// Ports the app may report for a device. Uploads with other ports are rejected,
// so the API can't be used to record arbitrary port scans.
const SCAN_PORTS = [21, 22, 23, 53, 80, 139, 443, 445, 554, 1883, 3306, 5000, 5432, 6379, 8080, 8443, 9100, 27017];

// Open on a home network these deserve a look (remote shells, file shares, databases).
const RISKY_PORTS = [21, 23, 445, 3306, 5432, 6379, 27017];

const SCAN_STATUSES = ["RUNNING", "COMPLETED", "PARTIAL", "FAILED", "CANCELLED"];
const FINAL_STATUSES = ["COMPLETED", "PARTIAL", "FAILED", "CANCELLED"];

const DISCOVERY_METHODS = ["arp", "tcp_probe", "icmp", "mdns", "ssdp"];
const PORT_STATES = ["open", "closed", "filtered", "unknown"];
const PROTOCOLS = ["tcp", "udp"];

const CHANGE_TYPES = [
    "device_added",
    "device_not_seen",
    "device_ip_changed",
    "device_hostname_changed",
    "port_opened",
    "port_closed",
];

const MAX_DEVICES_PER_SCAN = 1024;
// Keeps an upload request under the default 100 kB JSON body limit.
const MAX_DEVICES_PER_UPLOAD = 64;

// A RUNNING scan with no upload for this long is treated as abandoned (app killed).
const ABANDON_AFTER_MS = 30 * 60 * 1000;

module.exports = {
    SCAN_PORTS,
    RISKY_PORTS,
    SCAN_STATUSES,
    FINAL_STATUSES,
    DISCOVERY_METHODS,
    PORT_STATES,
    PROTOCOLS,
    CHANGE_TYPES,
    MAX_DEVICES_PER_SCAN,
    MAX_DEVICES_PER_UPLOAD,
    ABANDON_AFTER_MS,
};
