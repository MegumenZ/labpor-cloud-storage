import { appendFile, mkdir } from "fs/promises";

// Ensure logs directory exists
try {
    await mkdir("logs", { recursive: true });
} catch (err: any) {
    // Directory might already exist
}

export type LogLevel = "INFO" | "WARN" | "ERROR";

export interface LogPayload {
    timestamp: string;
    level: LogLevel;
    category: "HTTP" | "AUTH" | "CEPH" | "SYSTEM" | "ERROR";
    message: string;
    userId?: string;
    ip?: string;
    elapsedMs?: number;
    errorStack?: string;
    metadata?: Record<string, any>;
}

export async function writeLog(
    level: LogLevel,
    category: LogPayload["category"],
    message: string,
    extra: Partial<LogPayload> = {}
) {
    const payload: LogPayload = {
        timestamp: new Date().toISOString(),
        level,
        category,
        message,
        ...extra
    };
    
    const logLine = JSON.stringify(payload) + "\n";
    
    try {
        await appendFile("logs/cloud-backend.log", logLine);
    } catch (err: any) {
        console.error("Failed to write to log file:", err.message);
    }
    
    // Output to stdout/stderr for dev console visibility
    if (level === "ERROR") {
        console.error(`[${payload.timestamp}] [${level}] [${category}] ${message}`, extra.errorStack || "");
    } else {
        console.log(`[${payload.timestamp}] [${level}] [${category}] ${message}`);
    }
}
