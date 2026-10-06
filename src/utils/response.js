const sendSuccess = (res, status, message, data) => {
    const body = { success: true, message };
    if (data !== undefined) body.data = data;
    return res.status(status).json(body);
}

const sendError = (res, status, message, error) => {
    const body = { success: false, message };
    if (error && process.env.NODE_ENV !== "production") body.error = error.message || String(error);
    return res.status(status).json(body);
}

const serverError = (res, error) => {
    console.error(error);
    return sendError(res, 500, "Internal server error", error);
}

module.exports = {
    sendSuccess,
    sendError,
    serverError,
};
