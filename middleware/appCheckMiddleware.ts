import {Request, Response} from "express";
import {firestore} from "firebase-admin";
import {appCheck} from "../firebase/adminApp";
import {isDevelopment, isEmulator} from "../helpers/projectVersioning";
import {AccessConfigDocData} from "../types/Config";

export function appCheckMiddleware(
  handler: (req: Request, res: Response) => void | Promise<void>
) {
  return async (req: Request, res: Response) => {
    const appCheckResult = await checkAppCheck(req);
    if (!appCheckResult) {
      res.status(401).send("Unauthorized");
      return;
    }

    return handler(req, res);
  };
}

/**
 *
 * @returns true if user access is allowed, otherwise false.
 */
async function getUserAccessRight() {
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

    return data.user;
  } catch (error) {
    console.error("Error getting user access right", error);
    return false;
  }
}

const checkAppCheck = async (req: Request) => {
  const areUsersAllowed = await getUserAccessRight();

  if (!areUsersAllowed) {
    console.error("There is an ongoing restriction for all users.");
    return false;
  }

  const {appchecktoken} = req.headers;

  if (!appchecktoken) {
    console.error("App Check Token is missing");
    return false;
  }

  if (isDevelopment() && isEmulator()) {
    console.log(
      "App Check Token is always valid for (local) development environment"
    );
    return true;
  }

  try {
    const appCheckTokenString = appchecktoken.toString();

    const appCheckClaims = await appCheck.verifyToken(appCheckTokenString, {
      consume: true,
    });

    if (appCheckClaims.alreadyConsumed) {
      console.error(
        "POSSIBLE RE-PLAY ATTACK: \n",
        "AppCheck Token has already been consumed.",
        "appCheckClaims: \n",
        appCheckClaims
      );
      return false;
    }

    return true;
  } catch (error) {
    console.error("Error on checking appCheckToken: ", error);
    return false;
  }
};
