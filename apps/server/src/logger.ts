type LogLevel = "info" | "warn" | "error";

type LogFields = Record<string, string | number | boolean | null | undefined>;

const redactedKeyPattern = /(secret|token|password|phone|email|address|payment|buyer|access)/i;

function sanitize(fields: LogFields = {}): LogFields {
  return Object.fromEntries(
    Object.entries(fields).map(([key, value]) => [key, redactedKeyPattern.test(key) ? "[redacted]" : value])
  );
}

function write(level: LogLevel, message: string, fields?: LogFields): void {
  const payload = {
    level,
    message,
    time: new Date().toISOString(),
    ...sanitize(fields)
  };

  const line = JSON.stringify(payload);

  if (level === "error") {
    console.error(line);
    return;
  }

  if (level === "warn") {
    console.warn(line);
    return;
  }

  console.log(line);
}

export const logger = {
  info: (message: string, fields?: LogFields) => write("info", message, fields),
  warn: (message: string, fields?: LogFields) => write("warn", message, fields),
  error: (message: string, fields?: LogFields) => write("error", message, fields)
};
