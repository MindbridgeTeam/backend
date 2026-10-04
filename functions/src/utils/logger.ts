import { logger as fnLogger } from "firebase-functions/v2";

interface LogFields {
  actorId?: string;
  action?: string;
  resourceType?: string;
  resourceId?: string;
  [key: string]: unknown;
}

/**
 * Structured logging wrapper. Never pass secrets, tokens, or full request
 * bodies into `fields` - only identifiers and safe metadata.
 */
export const logger = {
  info: (message: string, fields: LogFields = {}) =>
    fnLogger.info(message, { ...fields, severity: "INFO" }),
  warn: (message: string, fields: LogFields = {}) =>
    fnLogger.warn(message, { ...fields, severity: "WARNING" }),
  error: (message: string, fields: LogFields = {}) =>
    fnLogger.error(message, { ...fields, severity: "ERROR" }),
};
