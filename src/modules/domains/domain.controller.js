const prisma = require("../../config/prisma");

const addDomain = async (req, res) => {
    try {
        const { name, url } = req.body;
        const userId = req.user.id;
        await prisma.domain.create({
            data: {
                userId: userId,
                name: name,
                url: url,
            },
        });
        return res.status(200).json({
            success: true,
            message: "Domain added successfully",
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: "Internal server error",
            error: error.message
        });
    }
};

const getDomains = async (req, res) => {
    try {
        const userId = req.user.id;
        const domains = await prisma.domain.findMany({
            where: {
                userId: userId,
            },
        });
        return res.status(200).json({
            success: true,
            message: "Domains fetched successfully",
            data: domains,
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: "Internal server error",
            error: error.message
        });
    }
}

const getDomain = async (req, res) => {
    try {
        const userId = req.user.id;
        const domainId = req.params.id;
        const domain = await prisma.domain.findUnique({
            where: {
                userId: userId,
                id: domainId,
            },
        });
        if (!domain) {
            return res.status(404).json({
                success: false,
                message: "Domain not found",
            });
        }
        return res.status(200).json({
            success: true,
            message: "Domains fetched successfully",
            data: domain,
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: "Internal server error",
            error: error.message
        });
    }
}

const updateDomain = async (req, res) => {
    try {
        const userId = req.user.id;
        const domainId = req.params.id;
        const { name, status, url } = req.body;
        const data = {}
        if (name != null && name != undefined) data.name = name;
        if (status != null && status != undefined) data.status = status;
        if (url != null && url != undefined) data.url = url;

        if (Object.keys(data).length == 0) {
            return res.status(400).json({
                success: false,
                message: "No data to update",
            });
        }
        await prisma.domain.update({
            where: {
                userId: userId,
                id: domainId,
            },
            data: data
        });
        return res.status(200).json({
            success: true,
            message: "Domain updated successfully",
        });

    } catch (error) {
        return res.status(500).json({
            success: false,
            message: "Internal server error",
            error: error.message
        });
    }
}

const deleteDomain = async (req, res) => {
    try {
        const userId = req.user.id;
        const domainId = req.params.id;
        await prisma.domain.delete({
            where: {
                userId: userId,
                id: domainId,
            },
        });
        return res.status(200).json({
            success: true,
            message: "Domain deleted successfully",
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: "Internal server error",
            error: error.message
        });
    }
}

module.exports = {
    addDomain,
    getDomains,
    updateDomain,
    deleteDomain,
    getDomain
};