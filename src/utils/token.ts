import bcrypt from "bcryptjs";

export const hashToken = (token: string): Promise<string> => {
  return bcrypt.hash(token, 10);
};
