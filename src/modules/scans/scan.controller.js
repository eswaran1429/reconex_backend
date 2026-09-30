const prisma = require("../../config/prisma");

const queueScan = async (req, res) => {

    try {
        const { domainId } = req.body;
        if (!domainId) {
            return res.status(400).json({ error: "Domain ID is required" });
        }
        const userId = req.user.id;
        const domain = await prisma.domain.findUnique({
            where: {
                id: domainId,
                userId: userId
            }
        });
        if (!domain) {
            return res.status(404).json({ error: "Domain not found" });
        }
        const scan = await prisma.scan.create({
            data: {
                domainId: domainId,
                status: "QUEUED",
            },
        });
        res.status(201).json({
            success: true,
            message: "Scan started", scan
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
}

const allScans = async (req, res) => {
    try {
        const userId = req.user.id;
        const scans = await prisma.scan.findMany({
            where: {
                domain: {
                    userId: userId
                }
            }
        });
        res.status(200).json({ message: "Scans fetched successfully", scans });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
}

const getScan = async (req, res) => {
    try {
        const userId = req.user.id;
        const scanId = req.params.id;
        const scan = await prisma.scan.findUnique({
            where: {
                id: scanId,
                domain: {
                    userId: userId
                }
            }
        });
        res.status(200).json({ message: "Scan fetched successfully", scan });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
}

module.exports = {
    queueScan,
    allScans, getScan
}