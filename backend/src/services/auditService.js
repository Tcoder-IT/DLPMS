const crypto = require('crypto');
const prisma = require('../config/db');

const GENESIS_HASH = crypto.createHash('sha256').update('GENESIS_BLOCK_DLPMS_DIRE_DAWA').digest('hex');

/**
 * Deterministically sorts object keys for canonical serialization
 */
function canonicalize(obj) {
    if (obj === null || typeof obj !== 'object') {
        return obj;
    }
    if (Array.isArray(obj)) {
        return obj.map(canonicalize);
    }
    const sortedKeys = Object.keys(obj).sort();
    const result = {};
    for (const key of sortedKeys) {
        result[key] = canonicalize(obj[key]);
    }
    return result;
}

/**
 * Computes canonical SHA-256 hash for an audit log event
 */
function computeAuditHash({ previousHash, timestampIso, userId, action, entityType, entityId, payload }) {
    const canonicalPayload = JSON.stringify(canonicalize(payload || {}));
    const rawString = `${previousHash}|${timestampIso}|${userId || 'SYSTEM'}|${action}|${entityType}|${entityId}|${canonicalPayload}`;
    return crypto.createHash('sha256').update(rawString).digest('hex');
}

/**
 * Appends a tamper-evident audit log to the cryptographic chain
 */
async function recordAuditLog({
    userId = null,
    ipAddress = '127.0.0.1',
    action,
    entityType,
    entityId = 'unknown',
    oldValue = null,
    newValue = null
}) {
    try {
        // 1. Get previous hash from latest log
        const lastLog = await prisma.auditLog.findFirst({
            orderBy: { timestamp: 'desc' }
        });

        const previousHash = lastLog ? lastLog.hash : GENESIS_HASH;
        const now = new Date();
        const timestampIso = now.toISOString();

        // 2. Compute canonical hash
        const hash = computeAuditHash({
            previousHash,
            timestampIso,
            userId,
            action,
            entityType,
            entityId,
            payload: newValue
        });

        // 3. Persist with exact timestamp
        const log = await prisma.auditLog.create({
            data: {
                timestamp: now,
                userId: userId || null,
                ipAddress: ipAddress || null,
                action,
                entityType,
                entityId: String(entityId),
                oldValue: oldValue ? canonicalize(oldValue) : null,
                newValue: newValue ? canonicalize(newValue) : null,
                hash,
                previousHash
            }
        });

        return log;
    } catch (error) {
        console.error('Failed to record audit log:', error);
        return null;
    }
}

/**
 * Cryptographically verifies the entire audit log chain for tamper-detection
 */
async function verifyAuditChain() {
    const logs = await prisma.auditLog.findMany({
        orderBy: { timestamp: 'asc' }
    });

    if (logs.length === 0) {
        return {
            isValid: true,
            totalRecords: 0,
            brokenAtLogId: null,
            error: null
        };
    }

    let expectedPreviousHash = GENESIS_HASH;

    for (let i = 0; i < logs.length; i++) {
        const log = logs[i];

        // Check pointer integrity
        if (log.previousHash !== expectedPreviousHash) {
            return {
                isValid: false,
                totalRecords: logs.length,
                verifiedRecordsCount: i,
                brokenAtLogId: log.logId,
                error: `Chain pointer broken at index ${i}: expected previousHash ${expectedPreviousHash}, found ${log.previousHash}`
            };
        }

        // Check payload and hash integrity
        const computedHash = computeAuditHash({
            previousHash: log.previousHash,
            timestampIso: log.timestamp.toISOString(),
            userId: log.userId,
            action: log.action,
            entityType: log.entityType,
            entityId: log.entityId,
            payload: log.newValue
        });

        if (computedHash !== log.hash) {
            return {
                isValid: false,
                totalRecords: logs.length,
                verifiedRecordsCount: i,
                brokenAtLogId: log.logId,
                error: `Content tampering detected at logId ${log.logId}: expected hash ${computedHash}, found ${log.hash}`
            };
        }

        expectedPreviousHash = log.hash;
    }

    return {
        isValid: true,
        totalRecords: logs.length,
        verifiedRecordsCount: logs.length,
        brokenAtLogId: null,
        error: null
    };
}

module.exports = {
    recordAuditLog,
    verifyAuditChain,
    computeAuditHash,
    canonicalize,
    GENESIS_HASH
};
