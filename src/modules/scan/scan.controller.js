const prisma = require("../../config/prisma");
const { sendSuccess, sendError, serverError } = require("../../utils/response");
const { startScan, STEPS } = require("./scan.service");

const scanSummary = {
    id: true,
    domainId: true,
    status: true,
    trigger: true,
    steps: true,
    changeCount: true,
    error: true,
    startedAt: true,
    completedAt: true,
    createdAt: true,
};

const findOwnedDomain = (req) => prisma.domain.findUnique({
    where: {
        userId: req.user.id,
        id: req.params.id,
    },
    select: {
        id: true,
        url: true,
    },
});

const findOwnedScan = (req, select) => prisma.scan.findFirst({
    where: {
        id: req.params.id,
        domain: {
            userId: req.user.id,
        },
    },
    select,
});

const pageOf = async (model, where, orderBy, select, { page, limit }) => {
    const [items, total] = await prisma.$transaction([
        prisma[model].findMany({
            where,
            orderBy,
            select,
            skip: (page - 1) * limit,
            take: limit,
        }),
        prisma[model].count({ where }),
    ]);
    return {
        items,
        pagination: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit),
        },
    };
}

const changeFilters = ({ category, type, severity }) => {
    const where = {};
    if (category) where.category = category;
    if (type) where.type = type;
    if (severity) where.severity = { in: severity };
    return where;
}

const startDomainScan = async (req, res) => {
    try {
        const domain = await findOwnedDomain(req);
        if (!domain) {
            return sendError(res, 404, "Domain not found");
        }

        const { scan, active } = await startScan(domain);
        if (active) {
            return sendError(res, 409, `Scan ${active.id} is already ${active.status.toLowerCase()} for this domain`);
        }
        return sendSuccess(res, 202, "Scan started", scan);
    } catch (error) {
        return serverError(res, error);
    }
}

const getDomainScans = async (req, res) => {
    try {
        const domain = await findOwnedDomain(req);
        if (!domain) {
            return sendError(res, 404, "Domain not found");
        }

        const { status, page, limit } = req.validated.query;
        const where = { domainId: domain.id };
        if (status) where.status = status;

        const result = await pageOf("scan", where, { createdAt: "desc" }, scanSummary, { page, limit });
        return sendSuccess(res, 200, "Scans fetched successfully", result);
    } catch (error) {
        return serverError(res, error);
    }
}

const getDomainChanges = async (req, res) => {
    try {
        const domain = await findOwnedDomain(req);
        if (!domain) {
            return sendError(res, 404, "Domain not found");
        }

        const query = req.validated.query;
        const where = { domainId: domain.id, ...changeFilters(query) };
        if (query.scanId) where.scanId = query.scanId;

        const result = await pageOf("change", where, [{ createdAt: "desc" }, { id: "asc" }], undefined, query);
        return sendSuccess(res, 200, "Changes fetched successfully", result);
    } catch (error) {
        return serverError(res, error);
    }
}

const getScan = async (req, res) => {
    try {
        const scan = await findOwnedScan(req, { ...scanSummary, snapshot: true });
        if (!scan) {
            return sendError(res, 404, "Scan not found");
        }
        return sendSuccess(res, 200, "Scan fetched successfully", scan);
    } catch (error) {
        return serverError(res, error);
    }
}

const getScanStatus = async (req, res) => {
    try {
        const scan = await findOwnedScan(req, {
            id: true,
            status: true,
            steps: true,
            startedAt: true,
            completedAt: true,
        });
        if (!scan) {
            return sendError(res, 404, "Scan not found");
        }

        const steps = scan.steps || {};
        const finished = STEPS.filter((step) => ["completed", "failed"].includes(steps[step]?.status)).length;
        return sendSuccess(res, 200, "Scan status fetched successfully", {
            id: scan.id,
            status: scan.status,
            progress: Math.round((finished / STEPS.length) * 100),
            currentStep: STEPS.find((step) => steps[step]?.status === "running") || null,
            steps: Object.fromEntries(STEPS.map((step) => [step, steps[step]?.status || "pending"])),
            startedAt: scan.startedAt,
            completedAt: scan.completedAt,
        });
    } catch (error) {
        return serverError(res, error);
    }
}

const getScanChanges = async (req, res) => {
    try {
        const scan = await findOwnedScan(req, { id: true });
        if (!scan) {
            return sendError(res, 404, "Scan not found");
        }

        const query = req.validated.query;
        const where = { scanId: scan.id, ...changeFilters(query) };
        const result = await pageOf("change", where, [{ category: "asc" }, { key: "asc" }], undefined, query);
        return sendSuccess(res, 200, "Scan changes fetched successfully", result);
    } catch (error) {
        return serverError(res, error);
    }
}

const getChange = async (req, res) => {
    try {
        const change = await prisma.change.findFirst({
            where: {
                id: req.params.id,
                domain: {
                    userId: req.user.id,
                },
            },
            include: {
                scan: {
                    select: {
                        id: true,
                        status: true,
                        createdAt: true,
                        completedAt: true,
                    },
                },
            },
        });
        if (!change) {
            return sendError(res, 404, "Change not found");
        }
        return sendSuccess(res, 200, "Change fetched successfully", change);
    } catch (error) {
        return serverError(res, error);
    }
}

module.exports = {
    startDomainScan,
    getDomainScans,
    getDomainChanges,
    getScan,
    getScanStatus,
    getScanChanges,
    getChange,
};
