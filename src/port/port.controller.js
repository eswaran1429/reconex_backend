const prisma = require("../../config/prisma");
const subdomainService = require("./subdomain.service");

const discoverSubdomains = async (req, res) => {
    try {
        const { id } = req.params;
        const result = await subdomainService.discoverSubdomains(id);

        // await 

        return res.status(200).json({
            success: true,
            data: result,
        });
    } catch (error) {
        console.error("Subdomain discovery error:", error);

        return res.status(500).json({
            success: false,
            message: error.message || "Failed to discover subdomains",
        });
    }
};

const getSubdomain = async (req, res) => {
    try {
        const id = req.params.id;
        const result = await prisma.subdomain.findMany({
            where: {
                domainId: id,
            },
        });

        return res.status(200).json({
            success: true,
            data: result,
        });
    } catch (error) {
        console.error("Subdomain discovery error:", error);

        return res.status(500).json({
            success: false,
            message: error.message || "Failed to discover subdomains",
        });
    }
}

module.exports = {
    discoverSubdomains,
    getSubdomain
};