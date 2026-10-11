import { createHash, randomBytes, randomInt } from "node:crypto";

export const JOIN_CODE_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ23456789";
export const JOIN_CODE_RE = /^[A-Z2-9]{6}$/;

/** 32 random bytes, base64url: host and session tokens share this shape. */
export function newToken(): string {
  return randomBytes(32).toString("base64url");
}

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function newJoinCode(): string {
  let code = "";
  for (let i = 0; i < 6; i++) code += JOIN_CODE_ALPHABET[randomInt(JOIN_CODE_ALPHABET.length)];
  return code;
}
