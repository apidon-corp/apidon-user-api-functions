import { appCheck } from "../firebase/adminApp";
import { Request, Response } from "express";

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

const isThereAnyRestriction = () => {
  const RESTRICT_ACCESS_TO_ALL_USERS =
    process.env.RESTRICT_ACCESS_TO_ALL_USERS || "";

  if (!RESTRICT_ACCESS_TO_ALL_USERS) {
    console.error("RESTRICT_ACCESS_TO_ALL_USERS is not set");
    return false;
  }

  return RESTRICT_ACCESS_TO_ALL_USERS === "TRUE";
};

const checkAppCheck = async (req: Request) => {
  const isRestricted = isThereAnyRestriction();

  if (isRestricted) {
    console.error("There is an ongoing restriction for all users.");
    return false;
  }

  const { appchecktoken } = req.headers;

  if (!appchecktoken) {
    console.error("App Check Token is missing");
    return false;
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
