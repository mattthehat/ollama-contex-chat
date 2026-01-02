/**
 * PII (Personally Identifiable Information) detection and redaction
 */

export type PIIType = 'ssn' | 'creditCard' | 'email' | 'phone' | 'ipAddress' | 'url';

export interface PIIMatch {
    type: PIIType;
    value: string;
    position: number;
}

export interface PIIDetectionResult {
    text: string;
    piiFound: PIIMatch[];
    hasRedactions: boolean;
}

/**
 * Patterns for detecting PII
 */
const PII_PATTERNS: Record<PIIType, RegExp> = {
    // US Social Security Number: 123-45-6789 or 123456789
    ssn: /\b\d{3}-?\d{2}-?\d{4}\b/g,

    // Credit card numbers (various formats)
    creditCard: /\b(?:\d{4}[- ]?){3}\d{4}\b/g,

    // Email addresses
    email: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,

    // Phone numbers (US/International)
    phone: /\b(?:\+\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g,

    // IP addresses
    ipAddress: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,

    // URLs (http/https)
    url: /\b(?:https?:\/\/)?(?:www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b(?:[-a-zA-Z0-9()@:%_\+.~#?&\/=]*)/g,
};

/**
 * Detect PII in text without redacting
 */
export function detectPII(text: string, types?: PIIType[]): PIIMatch[] {
    const piiFound: PIIMatch[] = [];
    const typesToCheck = types || (Object.keys(PII_PATTERNS) as PIIType[]);

    for (const type of typesToCheck) {
        const pattern = PII_PATTERNS[type];
        const matches = text.matchAll(new RegExp(pattern));

        for (const match of matches) {
            if (match.index !== undefined) {
                // Validate matches to reduce false positives
                if (isValidPII(type, match[0])) {
                    piiFound.push({
                        type,
                        value: match[0],
                        position: match.index,
                    });
                }
            }
        }
    }

    return piiFound;
}

/**
 * Validate PII matches to reduce false positives
 */
function isValidPII(type: PIIType, value: string): boolean {
    switch (type) {
        case 'creditCard':
            // Luhn algorithm check for credit cards
            return luhnCheck(value.replace(/\D/g, ''));

        case 'ssn':
            // SSN validation (basic)
            const digits = value.replace(/\D/g, '');
            // Invalid SSN patterns
            if (digits === '000000000' || digits === '123456789') return false;
            if (/^(\d)\1{8}$/.test(digits)) return false; // All same digit
            return true;

        case 'ipAddress':
            // Validate IP octets are 0-255
            const octets = value.split('.').map(Number);
            return octets.every(octet => octet >= 0 && octet <= 255);

        case 'email':
            // Basic email validation
            return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

        default:
            return true;
    }
}

/**
 * Luhn algorithm for credit card validation
 */
function luhnCheck(cardNumber: string): boolean {
    if (!/^\d+$/.test(cardNumber)) return false;

    let sum = 0;
    let isEven = false;

    for (let i = cardNumber.length - 1; i >= 0; i--) {
        let digit = parseInt(cardNumber[i], 10);

        if (isEven) {
            digit *= 2;
            if (digit > 9) digit -= 9;
        }

        sum += digit;
        isEven = !isEven;
    }

    return sum % 10 === 0;
}

/**
 * Redact PII in text
 */
export function redactPII(
    text: string,
    options: {
        types?: PIIType[];
        partialRedaction?: boolean; // Keep last 4 digits for CC, partial email, etc.
        placeholder?: string;
    } = {}
): PIIDetectionResult {
    const { types, partialRedaction = false, placeholder = '[REDACTED]' } = options;
    const piiFound = detectPII(text, types);

    if (piiFound.length === 0) {
        return { text, piiFound: [], hasRedactions: false };
    }

    let redacted = text;
    const typesToCheck = types || (Object.keys(PII_PATTERNS) as PIIType[]);

    // Redact in reverse order to maintain correct positions
    for (const type of typesToCheck) {
        const pattern = PII_PATTERNS[type];

        redacted = redacted.replace(pattern, (match) => {
            if (!isValidPII(type, match)) return match;

            if (partialRedaction) {
                switch (type) {
                    case 'creditCard':
                        const digits = match.replace(/\D/g, '');
                        return `****-****-****-${digits.slice(-4)}`;

                    case 'email':
                        const [local, domain] = match.split('@');
                        const maskedLocal = local[0] + '***' + local.slice(-1);
                        return `${maskedLocal}@${domain}`;

                    case 'phone':
                        const phoneDigits = match.replace(/\D/g, '');
                        return `***-***-${phoneDigits.slice(-4)}`;

                    case 'ssn':
                        return `***-**-${match.slice(-4)}`;

                    default:
                        return `${placeholder} ${type.toUpperCase()}`;
                }
            }

            return `${placeholder} ${type.toUpperCase()}`;
        });
    }

    return {
        text: redacted,
        piiFound,
        hasRedactions: true,
    };
}

/**
 * Analyze document for PII before upload
 */
export function analyzePIIRisk(text: string): {
    riskLevel: 'low' | 'medium' | 'high';
    piiCount: number;
    types: PIIType[];
} {
    const piiFound = detectPII(text);
    const types = [...new Set(piiFound.map(p => p.type))];

    let riskLevel: 'low' | 'medium' | 'high' = 'low';

    // Determine risk level
    if (piiFound.length === 0) {
        riskLevel = 'low';
    } else if (piiFound.length < 5 && !types.includes('ssn') && !types.includes('creditCard')) {
        riskLevel = 'medium';
    } else {
        riskLevel = 'high';
    }

    return {
        riskLevel,
        piiCount: piiFound.length,
        types,
    };
}
