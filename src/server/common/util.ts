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
