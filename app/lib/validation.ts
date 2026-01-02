/**
 * File validation and security utilities
 */

export interface ValidationResult {
    valid: boolean;
    error?: string;
    warnings?: string[];
}

/**
 * Validate file upload with comprehensive checks
 */
export function validateFileUpload(
    file: File,
    maxSize: number = 50 * 1024 * 1024 // 50MB default
): ValidationResult {
    const warnings: string[] = [];

    // Check file size
    if (file.size === 0) {
        return { valid: false, error: 'File is empty' };
    }

    if (file.size > maxSize) {
        const sizeMB = (maxSize / (1024 * 1024)).toFixed(0);
        return { valid: false, error: `File too large (max ${sizeMB}MB)` };
    }

    // Check file extension whitelist
    const allowedExtensions = ['.pdf', '.txt', '.md', '.markdown'];
    const ext = file.name.toLowerCase().match(/\.[^.]+$/)?.[0];

    if (!ext) {
        return { valid: false, error: 'File has no extension' };
    }

    if (!allowedExtensions.includes(ext)) {
        return {
            valid: false,
            error: `Invalid file type. Allowed: ${allowedExtensions.join(', ')}`
        };
    }

    // Check MIME type
    const allowedMimeTypes = [
        'application/pdf',
        'text/plain',
        'text/markdown',
        'application/octet-stream' // Some systems don't set proper MIME for .md
    ];

    if (!allowedMimeTypes.includes(file.type)) {
        warnings.push(`Unexpected MIME type: ${file.type}`);
    }

    // Validate filename (prevent path traversal)
    if (file.name.includes('..') || file.name.includes('/') || file.name.includes('\\')) {
        return { valid: false, error: 'Invalid filename (path traversal detected)' };
    }

    // Check for suspicious characters in filename
    if (/[<>:"|?*\x00-\x1F]/.test(file.name)) {
        return { valid: false, error: 'Filename contains invalid characters' };
    }

    // Check filename length
    if (file.name.length > 255) {
        return { valid: false, error: 'Filename too long (max 255 characters)' };
    }

    // Warn about large files
    if (file.size > 10 * 1024 * 1024) {
        warnings.push('Large file may take longer to process');
    }

    return { valid: true, warnings: warnings.length > 0 ? warnings : undefined };
}

/**
 * Validate document title
 */
export function validateDocumentTitle(title: string): ValidationResult {
    if (!title || title.trim().length === 0) {
        return { valid: false, error: 'Title is required' };
    }

    if (title.length > 200) {
        return { valid: false, error: 'Title too long (max 200 characters)' };
    }

    // Check for suspicious patterns
    if (/<script|javascript:|onerror=/i.test(title)) {
        return { valid: false, error: 'Title contains suspicious content' };
    }

    return { valid: true };
}

/**
 * Sanitize filename for safe storage
 */
export function sanitizeFilename(filename: string): string {
    // Remove path components
    let sanitized = filename.replace(/^.*[\\\/]/, '');

    // Replace spaces and special characters
    sanitized = sanitized.replace(/[^a-zA-Z0-9._-]/g, '_');

    // Remove multiple underscores
    sanitized = sanitized.replace(/_+/g, '_');

    // Ensure it has an extension
    if (!/\.[a-zA-Z0-9]+$/.test(sanitized)) {
        sanitized += '.txt';
    }

    // Limit length
    if (sanitized.length > 255) {
        const ext = sanitized.match(/\.[^.]+$/)?.[0] || '';
        sanitized = sanitized.substring(0, 255 - ext.length) + ext;
    }

    return sanitized;
}

/**
 * Validate buffer for file type (magic number check)
 */
export function validateFileBuffer(buffer: Buffer, expectedType: 'pdf' | 'text'): ValidationResult {
    if (expectedType === 'pdf') {
        // PDF files should start with %PDF-
        const header = buffer.toString('ascii', 0, 5);
        if (header !== '%PDF-') {
            return { valid: false, error: 'File is not a valid PDF (incorrect magic number)' };
        }
    }

    // Check for null bytes in text files (could indicate binary data)
    if (expectedType === 'text') {
        const sample = buffer.toString('utf8', 0, Math.min(1024, buffer.length));
        if (sample.includes('\x00')) {
            return { valid: false, error: 'File appears to be binary, not text' };
        }
    }

    return { valid: true };
}
