import jwt from "jsonwebtoken";

interface TokenPayload {
  userId: string;
}

export const generateTokens = (user: { id: string }) => {
  const accessTokenPayload: TokenPayload = { userId: user.id };

  const refreshTokenPayload: TokenPayload = { userId: user.id };

  const accessToken = jwt.sign(
    accessTokenPayload,
    process.env.ACCESS_TOKEN_SECRET!,
    { expiresIn: "15m" }
  );

  const refreshToken = jwt.sign(
    refreshTokenPayload,
    process.env.REFRESH_TOKEN_SECRET!,
    { expiresIn: "30d" }
  );

  return { accessToken, refreshToken };
};
