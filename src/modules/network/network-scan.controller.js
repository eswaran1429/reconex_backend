const prisma = require("../../config/prisma");
const { sendSuccess, sendError, serverError } = require("../../utils/response");
const { parseIPv4 } = require("./network.ip");
const { findOwnedScan, expireAbandonedScans, saveResults, completeScan } = require("./network.service");
const { formatScan, formatObservation, paginated } = require("./network.format");
const { handleError } = require("./network.controller");

/** Owned scan with abandoned-scan expiry applied, or null. */
const loadScan = async (req) => {
    const scan = await findOwnedScan(req.user.id, req.params.id);
    if (!scan) return null;
    if (scan.status !== "RUNNING") return scan;
    await expireAbandonedScans(scan.networkId);
    return findOwnedScan(req.user.id, scan.id);
}

const uploadResults = async (req, res) => {
    try {
        const scan = await loadScan(req);
        if (!scan) return sendError(res, 404, "Scan not found");
        if (scan.status !== "RUNNING") return sendError(res, 409, "Scan is no longer running");
        const result = await saveResults(scan, req.body);
        return sendSuccess(res, 200, "Scan results saved", result);
    } catch (error) {
        return handleError(res, error);
    }
}

const finishScan = async (req, res) => {
    try {
        const scan = await loadScan(req);
        if (!scan) return sendError(res, 404, "Scan not found");
        if (scan.status !== "RUNNING") return sendError(res, 409, "Scan has already finished");
        const finished = await completeScan(scan, req.body);
        return sendSuccess(res, 200, "Scan finished", formatScan(finished));
    } catch (error) {
        return handleError(res, error);
    }
}

const getScan = async (req, res) => {
    try {
        const scan = await loadScan(req);
        if (!scan) return sendError(res, 404, "Scan not found");
        return sendSuccess(res, 200, "Scan fetched successfully", formatScan(scan));
    } catch (error) {
        return serverError(res, error);
    }
}

// At most MAX_DEVICES_PER_SCAN rows, so sort numerically by IP in memory and slice.
const getScanDevices = async (req, res) => {
    try {
        const scan = await findOwnedScan(req.user.id, req.params.id);
        if (!scan) return sendError(res, 404, "Scan not found");

        const { page, limit } = req.validated.query;
        const rows = await prisma.networkDeviceObservation.findMany({
            where: { scanId: scan.id },
            include: { ports: true, device: { select: { identity: true } } },
        });
        rows.sort((a, b) => parseIPv4(a.ipAddress) - parseIPv4(b.ipAddress));
        const items = rows.slice((page - 1) * limit, page * limit).map(formatObservation);
        return sendSuccess(res, 200, "Scan devices fetched successfully", paginated(items, page, limit, rows.length));
    } catch (error) {
        return serverError(res, error);
    }
}

module.exports = {
    uploadResults,
    finishScan,
    getScan,
    getScanDevices,
};
