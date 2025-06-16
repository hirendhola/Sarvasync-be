import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;

const ENCRYPTION_KEY = process.env.OAUTH_TOKEN_ENCRYPTION_KEY;

if (!ENCRYPTION_KEY || ENCRYPTION_KEY.length !== 64) {
  throw new Error(
    "FATAL_ERROR: OAUTH_TOKEN_ENCRYPTION_KEY must be a 64-character hex string."
  );
}

const key = Buffer.from(ENCRYPTION_KEY, "hex");

export const encrypt = (text: string): string => {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag().toString("hex");

  return `${iv.toString("hex")}:${authTag}:${encrypted}`;
};

export const decrypt = (encryptedText: string): string => {
  const [ivHex, authTagHex, encryptedData] = encryptedText.split(":");

  if (!ivHex || !authTagHex || !encryptedData) {
    throw new Error("Invalid encrypted text format.");
  }

  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  let decrypted = decipher.update(encryptedData, "hex", "utf8");
  decrypted += decipher.final("utf8");

  return decrypted;
};