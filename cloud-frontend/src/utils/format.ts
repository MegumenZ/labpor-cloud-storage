export const formatSize = (size: string | number) => {
    if (typeof size === "string" && /[a-zA-Z]/.test(size)) return size;

    const bytes = typeof size === "number" ? size : parseFloat(size);
    if (isNaN(bytes)) return String(size);
    if (bytes === 0) return "0 B";

    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
};
