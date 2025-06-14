import jwt from 'jsonwebtoken';

// This interface defines the data we will store inside our JWTs.
interface TokenPayload {
  userId: string;
}

/**
 * Generates a pair of access and refresh tokens for a user.
 * @param user An object containing the user's ID.
 * @returns An object with the accessToken and refreshToken strings.
 */
export const generateTokens = (user: { id: string }) => {
  // The access token payload is simple: just the user's ID.
  const accessTokenPayload: TokenPayload = { userId: user.id };

  // The refresh token payload is identical for this use case.
  const refreshTokenPayload: TokenPayload = { userId: user.id };

  // Create the short-lived access token.
  const accessToken = jwt.sign(
    accessTokenPayload,
    process.env.ACCESS_TOKEN_SECRET!,
    { expiresIn: process.env.ACCESS_TOKEN_EXPIRY! } // e.g., '15m'
  );

  // Create the long-lived refresh token.
  const refreshToken = jwt.sign(
    refreshTokenPayload,
    process.env.REFRESH_TOKEN_SECRET!,
    { expiresIn: process.env.REFRESH_TOKEN_EXPIRY! } // e.g., '30d'
  );

  return { accessToken, refreshToken };
};