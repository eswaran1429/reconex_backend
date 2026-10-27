const prisma = require("../../config/prisma");
const { sendSuccess, sendError, serverError } = require("../../utils/response");
const { findOwnedDevice } = require("./network.service");
const { formatDevice, formatPort, sortPorts, paginated } = require("./network.format");
const { seenInLatestScan, latestObservationInclude } = require("./network.controller");

const latestObservation = (deviceId) => prisma.networkDeviceObservation.findFirst({
    where: { deviceId },
    orderBy: { observedAt: "desc" },
    include: { ports: true },
});

const getDevice = async (req, res) => {
    try {
        const owned = await findOwnedDevice(req.user.id, req.params.id);
        if (!owned) return sendError(res, 404, "Device not found");
        const { observations, ...device } = await prisma.networkDevice.findUnique({
            where: { id: owned.id },
            include: latestObservationInclude,
        });
        const { ids } = await seenInLatestScan(device.networkId);
        return sendSuccess(res, 200, "Device fetched successfully", formatDevice(device, observations[0], ids));
    } catch (error) {
        return serverError(res, error);
    }
}

const getDevicePorts = async (req, res) => {
    try {
        const device = await findOwnedDevice(req.user.id, req.params.id);
        if (!device) return sendError(res, 404, "Device not found");
        const latest = await latestObservation(device.id);
        const ports = latest ? sortPorts(latest.ports).map((port) => formatPort(port, latest.observedAt)) : [];
        return sendSuccess(res, 200, "Device ports fetched successfully", ports);
    } catch (error) {
        return serverError(res, error);
    }
}

const getDeviceHistory = async (req, res) => {
    try {
        const device = await findOwnedDevice(req.user.id, req.params.id);
        if (!device) return sendError(res, 404, "Device not found");

        const { page, limit } = req.validated.query;
        const where = { deviceId: device.id };
        const [rows, total] = await prisma.$transaction([
            prisma.networkDeviceObservation.findMany({
                where,
                include: {
                    scan: { select: { status: true } },
                    ports: { where: { state: "open" } },
                },
                orderBy: { observedAt: "desc" },
                skip: (page - 1) * limit,
                take: limit,
            }),
            prisma.networkDeviceObservation.count({ where }),
        ]);
        const items = rows.map((row) => ({
            scanId: row.scanId,
            scanStatus: row.scan.status,
            ipAddress: row.ipAddress,
            hostname: row.hostname,
            discoveryMethod: row.discoveryMethod,
            observedAt: row.observedAt,
            openPorts: sortPorts(row.ports).map((port) => formatPort(port)),
        }));
        return sendSuccess(res, 200, "Device history fetched successfully", paginated(items, page, limit, total));
    } catch (error) {
        return serverError(res, error);
    }
}

module.exports = {
    getDevice,
    getDevicePorts,
    getDeviceHistory,
};
