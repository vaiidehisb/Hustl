import pino, { type LoggerOptions } from "pino"

export function loggerOptions(service: string): LoggerOptions {
  const pretty = process.env.NODE_ENV !== "production"
  return {
    level: process.env.LOG_LEVEL ?? "info",
    base: { service },
    redact: ["req.headers.authorization", 'req.headers["x-internal-token"]', "*.password", "*.passwordHash", "*.refreshToken"],
    ...(pretty && { transport: { target: "pino-pretty", options: { translateTime: "HH:MM:ss", ignore: "pid,hostname" } } }),
  }
}

export const createLogger = (service: string) => pino(loggerOptions(service))
