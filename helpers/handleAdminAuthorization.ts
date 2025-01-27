import {firestore} from "firebase-admin";
import {getConfigObject} from "../configs/getConfigObject";

import * as dotenv from "dotenv";
import {AccessConfigDocData} from "@/types/Config";

dotenv.config();

const configObject = getConfigObject();

if (!configObject) {
  throw new Error("Config object is undefined");
}
/**
 *
 * @returns true if admin access is allowed, otherwise false.
 */
async function getAdminAccessRight() {
  try {
    const accessDoc = await firestore().doc("/config/access").get();
    if (!accessDoc.exists) {
      console.error("Access document does not exist");
      return false;
    }

    const data = accessDoc.data() as AccessConfigDocData;
    if (!data) {
      console.error("Access document data is undefined");
      return false;
    }

    return data.admin;
  } catch (error) {
    console.error("Error getting admin access right", error);
    return false;
  }
}

/**
 * Handles the authorization of incoming requests.
 * @param authorization - The authorization header value.
 * @returns True if the authorization is valid, otherwise false.
 */
export async function handleAdminAuthorization(
  authorization: string | undefined
) {
  const isAdminsAllowed = await getAdminAccessRight();

  if (!isAdminsAllowed) {
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
