// /types/passport-magic-link.d.ts
import { Strategy as PassportStrategy } from "passport-strategy";
import { Request } from "express";
import { User } from "@prisma/client";

declare module "passport-magic-link" {
  export interface MagicLinkOptions {
    secret: string;
    userFields: string[];
    tokenField: string;
    verifyUserAfterToken?: boolean;
    passReqToCallback?: boolean;
    ttl?: number;
  }

  type MagicLinkUser = { [key: string]: any };

  export type SendTokenFunction = (
    user: MagicLinkUser,
    token: string
  ) => Promise<void> | void;

  export type VerifyFunction = (
    payload: MagicLinkUser,
    done: (error: any, user?: User | false, info?: { message: string }) => void
  ) => void;

  export class Strategy extends PassportStrategy {
    name: string;
    public authenticate(req: Request, options?: any): void;

    constructor(
      options: MagicLinkOptions,
      sendToken: SendTokenFunction,
      verify: VerifyFunction
    );
    constructor(options: MagicLinkOptions, sendToken: SendTokenFunction);
    constructor(sendToken: SendTokenFunction, verify: VerifyFunction);
    constructor(sendToken: SendTokenFunction);
  }
}
