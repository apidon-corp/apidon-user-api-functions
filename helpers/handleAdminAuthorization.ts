import {getConfigObject} from "../configs/getConfigObject";

import * as dotenv from "dotenv";

dotenv.config();

const configObject = getConfigObject();

if (!configObject) {
  throw new Error("Config object is undefined");
}

/**
 * Handles the authorization of incoming requests.
 * @param authorization - The authorization header value.
 * @returns True if the authorization is valid, otherwise false.
 */
export function handleAdminAuthorization(authorization: string | undefined) {
  const isThereAnyRestriction = process.env.RESTRICT_ACCESS_TO_ADMINS as
    | "TRUE"
    | "FALSE";

  if (isThereAnyRestriction === "TRUE") {
    console.error("Access to admins is restricted.");
    return false;
  }

  if (!authorization) {
    console.error("Authorization header is missing");
    return false;
  }

  if (!configObject) {
    console.error("Config object is undefined");
    return false;
  }

  return authorization === configObject.ADMIN;
}
