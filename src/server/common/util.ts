import assert from 'node:assert';
import dotenv from 'dotenv';

let envLoaded = false;

const ensureEnvLoaded = () => {
  if (envLoaded) {
    return;
  }

  dotenv.config();
  envLoaded = true;
};

const parseEnvFlag = (value: unknown) => {
  if (value === undefined || value === null) {
    return false;
  }
  const normalized = String(value).trim().toLowerCase();
  return (
    normalized === '1' ||
    normalized === 'true' ||
    normalized === 'yes' ||
    normalized === 'on'
  );
};

export const clamp = (min: number, value: number, max: number) => {
  return Math.max(min, Math.min(value, max));
};

export const env = (
  name: string,
  assertMessage = `The environment variable '${name}' must be set!`,
): string => {
  ensureEnvLoaded();
  const variable = process.env[name];
  assert(variable !== undefined && variable !== '', assertMessage);
  return variable;
};

export const isDebugEnabled = () => {
  ensureEnvLoaded();
  const debugValue = process.env.DEBUG ?? process.env.debug;
  if (debugValue === undefined) {
    return false;
  }
  if (parseEnvFlag(debugValue)) {
    return true;
  }
  const normalized = String(debugValue).trim().toLowerCase();
  if (
    normalized === '' ||
    normalized === '0' ||
    normalized === 'false' ||
    normalized === 'no' ||
    normalized === 'off'
  ) {
    return false;
  }
  return true;
};
