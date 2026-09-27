export const MAX_UPLOAD_BYTES = 500 * 1024 * 1024 * 1024;

export class InvalidUploadSizeError extends Error {
    constructor(message = "A valid non-negative integer upload size is required.") {
        super(message);
        this.name = "InvalidUploadSizeError";
    }
}

export class UploadTooLargeError extends Error {
    readonly maxBytes = MAX_UPLOAD_BYTES;

    constructor() {
        super("File size exceeds the maximum allowed upload size.");
        this.name = "UploadTooLargeError";
    }
}

export class UploadSizeMismatchError extends Error {
    constructor(
        readonly expectedBytes: number,
        readonly actualBytes: number,
    ) {
        super("The uploaded byte count does not match the declared file size.");
        this.name = "UploadSizeMismatchError";
    }
}

export class StorageQuotaExceededError extends Error {
    readonly availableBytes: number;

    constructor(
        readonly limitBytes: number,
        readonly usedBytes: number,
        readonly reservedBytes: number,
        readonly requestedBytes: number,
    ) {
        const availableBytes = Math.max(0, limitBytes - usedBytes - reservedBytes);
        super("Storage quota exceeded.");
        this.name = "StorageQuotaExceededError";
        this.availableBytes = availableBytes;
    }
}

export function validateUploadSize(size: number): number {
    if (!Number.isSafeInteger(size) || size < 0) {
        throw new InvalidUploadSizeError();
    }
    if (size > MAX_UPLOAD_BYTES) {
        throw new UploadTooLargeError();
    }
    return size;
}

export function parseUploadSize(value: string | null): number {
    if (value === null || !/^\d+$/.test(value.trim())) {
        throw new InvalidUploadSizeError("X-File-Size header is required and must be an integer.");
    }

    return validateUploadSize(Number(value.trim()));
}

export function assertUploadSizeMatches(expectedBytes: number, actualBytes: number): void {
    if (expectedBytes !== actualBytes) {
        throw new UploadSizeMismatchError(expectedBytes, actualBytes);
    }
}

export function assertQuotaCapacity(
    limitBytes: number,
    usedBytes: number,
    reservedBytes: number,
    requestedBytes: number,
): void {
    for (const value of [limitBytes, usedBytes, reservedBytes, requestedBytes]) {
        if (!Number.isSafeInteger(value) || value < 0) {
            throw new RangeError("Quota values must be non-negative safe integers.");
        }
    }

    if (!Number.isSafeInteger(usedBytes + reservedBytes)) {
        throw new RangeError("Combined storage usage is outside the supported safe integer range.");
    }

    if (requestedBytes > Math.max(0, limitBytes - usedBytes - reservedBytes)) {
        throw new StorageQuotaExceededError(limitBytes, usedBytes, reservedBytes, requestedBytes);
    }
}
