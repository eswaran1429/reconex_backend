const { z, prefixedId, idParam, pagination, severityList } = require("../../utils/schemas");
const { parseIPv4, subnetProblem } = require("./network.ip");
const {
    SCAN_PORTS,
    SCAN_STATUSES,
    FINAL_STATUSES,
    DISCOVERY_METHODS,
    PORT_STATES,
    PROTOCOLS,
    CHANGE_TYPES,
    MAX_DEVICES_PER_UPLOAD,
} = require("./network.constants");

const networkId = idParam("network");
const scanId = idParam("network_scan");
const deviceId = idParam("network_device");

const name = z.string().trim().min(1).max(100);

const subnet = z.string().trim().superRefine((value, ctx) => {
    const problem = subnetProblem(value);
    if (problem) ctx.addIssue({ code: "custom", message: problem });
});

const addBody = z.object({
    name,
    subnet,
    identifier: z.string().trim().min(1).max(200).optional(),
});

// Subnet is fixed: changing it would make old scans incomparable.
const updateBody = z.object({ name });

const ipv4 = z.string().trim().refine((value) => parseIPv4(value) !== null, "Must be an IPv4 address");

const macAddress = z.string().trim().toLowerCase().regex(/^([0-9a-f]{2}:){5}[0-9a-f]{2}$/, "Must look like aa:bb:cc:dd:ee:ff");

const portResult = z.object({
    port: z.number().int().refine((value) => SCAN_PORTS.includes(value), `Must be one of the scan ports: ${SCAN_PORTS.join(", ")}`),
    protocol: z.enum(PROTOCOLS).default("tcp"),
    state: z.enum(PORT_STATES),
    service: z.string().trim().min(1).max(64).nullish(),
});

const deviceResult = z.object({
    ipAddress: ipv4,
    hostname: z.string().trim().min(1).max(253).nullish(),
    macAddress: macAddress.nullish(),
    discoveryMethod: z.enum(DISCOVERY_METHODS),
    observedAt: z.coerce.date().optional(),
    ports: z.array(portResult).max(SCAN_PORTS.length).default([]),
});

const resultsBody = z.object({
    devices: z.array(deviceResult).max(MAX_DEVICES_PER_UPLOAD),
    progress: z.object({
        probed: z.number().int().min(0),
        total: z.number().int().min(0),
    }).optional(),
});

const completeBody = z.object({
    status: z.enum(FINAL_STATUSES),
    error: z.string().trim().min(1).max(500).nullish(),
});

const scanListQuery = pagination.extend({
    status: z.enum(SCAN_STATUSES).optional(),
});

const changeQuery = pagination.extend({
    type: z.enum(CHANGE_TYPES).optional(),
    severity: severityList.optional(),
    scanId: prefixedId("network_scan").optional(),
});

const deviceListQuery = pagination.extend({
    seen: z.enum(["latest"]).optional(),
});

module.exports = {
    networkId,
    scanId,
    deviceId,
    addBody,
    updateBody,
    resultsBody,
    completeBody,
    scanListQuery,
    changeQuery,
    deviceListQuery,
    pagination,
};
