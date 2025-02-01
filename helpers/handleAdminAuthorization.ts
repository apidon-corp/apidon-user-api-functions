import {firestore} from "firebase-admin";
import {AccessConfigDocData, PasswordsDocData} from "@/types/Config";

import * as crypto from "crypto";

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

async function getAdminPasswordHashFromDatabase() {
  try {
    const passwordsDoc = await firestore().doc("/config/passwords").get();
    if (!passwordsDoc.exists) {
      console.error("Passwords document does not exist");
      return false;
    }

    const data = passwordsDoc.data() as PasswordsDocData;
    if (!data) {
      console.error("Passwords document data is undefined");
      return false;
    }

    return data.admin;
  } catch (error) {
    console.error("Error getting admin password hash from database", error);
    return false;
  }
}

function createHashOfGivenPassword(input: string) {
  return crypto.createHash("sha256").update(input).digest("hex");
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

  const hashOfAdminPassword = await getAdminPasswordHashFromDatabase();
  if (!hashOfAdminPassword) {
    console.error("Admin password hash is missing");
    return false;
  }

  const hashOfAuth = createHashOfGivenPassword(authorization);

  return hashOfAdminPassword === hashOfAuth;
}
