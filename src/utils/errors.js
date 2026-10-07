class ScanError extends Error {
    constructor(message, cause) {
        super(message);
        this.name = "ScanError";
        this.cause = cause;
    }
}

module.exports = {
    ScanError,
};
