import "server-only";

const appEnvironments = ["development", "test", "production"] as const;

type AppEnvironment = (typeof appEnvironments)[number];

function isAppEnvironment(value: string): value is AppEnvironment {
  return (appEnvironments as readonly string[]).includes(value);
}

function required(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function appEnvironment(): AppEnvironment {
  const value = required("APP_ENV");

  if (!isAppEnvironment(value)) {
    throw new Error(
      `APP_ENV must be one of: ${appEnvironments.join(", ")}. Received: ${value}`,
    );
  }

  return value;
}

function url(name: string): URL {
  const value = required(name);

  try {
    return new URL(value);
  } catch {
    throw new Error(`${name} must be a valid absolute URL. Received: ${value}`);
  }
}

export const env = Object.freeze({
  appEnvironment: appEnvironment(),
  appName: required("APP_NAME"),
  paymentApiBaseUrl: url("PAYMENT_API_BASE_URL"),
});
