import {appCheck} from "../firebase/adminApp";
import {Request, Response} from "express";

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

const checkAppCheck = async (req: Request) => {
  const {appchecktoken} = req.headers;

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
