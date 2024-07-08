import { DecodedIdToken } from "firebase-admin/auth";
import { auth } from "../firebase/adminApp";

/**
 * Get the display name of a user from the authorization token.
 * @param authorization - The authorization header containing the Bearer token.
 * @returns The display name if successful, otherwise an empty string.
 */
export default async function getDisplayName(authorization: string) {
  if (!authorization.startsWith("Bearer ")) {
    console.error("Authorization header is not in the correct format.");
    return "";
  }

  const idToken = authorization.split("Bearer ")[1];
  let decodedToken: DecodedIdToken;

  try {
    decodedToken = await auth.verifyIdToken(idToken);
  } catch (error) {
    console.error("Error verifying token.", error);
    return "";
  }

  const username = decodedToken.name as string;

  if (!username) {
    console.error("User has no display name.");
    return "";
  }

  return username;
}
