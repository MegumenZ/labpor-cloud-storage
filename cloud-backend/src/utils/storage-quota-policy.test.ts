import { describe, expect, it } from "bun:test";
import {
    assertQuotaCapacity,
    assertUploadSizeMatches,
    MAX_UPLOAD_BYTES,
    parseUploadSize,
    StorageQuotaExceededError,
    UploadSizeMismatchError,
    UploadTooLargeError,
} from "./storage-quota-policy";

describe("storage quota policy", () => {
    it("allows an upload that fits exactly within available capacity", () => {
        expect(() => assertQuotaCapacity(100, 40, 20, 40)).not.toThrow();
    });

    it("accounts for concurrent upload reservations", () => {
        expect(() => assertQuotaCapacity(100, 40, 30, 31)).toThrow(StorageQuotaExceededError);
    });

    it("reports available bytes when quota is exceeded", () => {
        try {
            assertQuotaCapacity(100, 60, 20, 21);
            throw new Error("Expected quota validation to fail.");
        } catch (error) {
            expect(error).toBeInstanceOf(StorageQuotaExceededError);
            expect((error as StorageQuotaExceededError).availableBytes).toBe(20);
        }
    });

    it("requires a non-negative integer size header", () => {
        expect(parseUploadSize("1024")).toBe(1024);
        expect(() => parseUploadSize(null)).toThrow();
        expect(() => parseUploadSize("-1")).toThrow();
        expect(() => parseUploadSize("1.5")).toThrow();
    });

    it("rejects uploads above the hard per-file limit", () => {
        expect(() => parseUploadSize(String(MAX_UPLOAD_BYTES + 1))).toThrow(UploadTooLargeError);
    });

    it("rejects a body whose actual size differs from its declaration", () => {
        expect(() => assertUploadSizeMatches(10, 9)).toThrow(UploadSizeMismatchError);
    });
});
