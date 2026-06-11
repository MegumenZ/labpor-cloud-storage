import { S3Client } from "@aws-sdk/client-s3";

const endpoint = process.env.S3_ENDPOINT;
const accessKeyId = process.env.S3_ACCESS_KEY_ID;
const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;
const bucketName = process.env.S3_BUCKET_NAME || "labpro-storage";

if (!endpoint || !accessKeyId || !secretAccessKey) {
    throw new Error("CRITICAL: S3 configuration environment variables (S3_ENDPOINT, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY) are missing!");
}

export const s3 = new S3Client({
    region: process.env.S3_REGION || "us-east-1",
    endpoint,
    credentials: {
        accessKeyId,
        secretAccessKey,
    },
    forcePathStyle: true, // Required for custom S3 providers like Ceph RGW or MinIO
});

export const BUCKET_NAME = bucketName;
