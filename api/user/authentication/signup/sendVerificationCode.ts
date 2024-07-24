import { onRequest } from "firebase-functions/v2/https";
import { firestore, auth } from "../../../../firebase/adminApp";
import { appCheckMiddleware } from "../../../../middleware/appCheckMiddleware";
import { keys } from "../../../../config";

import * as SG from "@sendgrid/mail";

function checkProps(email: string, password: string) {
  if (!email || !password) return false;

  const emailRegex =
    /^[a-zA-Z0-9._%+-]+@(gmail\.com|icloud\.com|yahoo\.com|outlook\.com)$/i;
  const emailRegexTestResult = emailRegex.test(email);

  if (!emailRegexTestResult) {
    console.error("Email is not valid");
    return false;
  }

  const minLengthCase = password.length >= 8;
  const hasLowerCase = /[a-z]/.test(password);
  const hasUpperCase = /[A-Z]/.test(password);
  const hasDigit = /\d/.test(password);

  if (minLengthCase && hasLowerCase && hasUpperCase && hasDigit) return true;

  console.error("Password is not valid");
  return false;
}

async function isEmailUnique(email: string) {
  try {
    await auth.getUserByEmail(email);
    console.error("Email is already taken");
    return false;
  } catch (error) {
    console.log("Email is unique");
    return true;
  }
}

function generateSixDigitNumber(): number {
  // Generate a random number between 100000 and 999999
  return Math.floor(100000 + Math.random() * 900000);
}

async function createVerificationDoc(email: string, code: number) {
  try {
    const newVerificationDocRef = firestore.doc(`emailVerifications/${email}`);

    await newVerificationDocRef.set({
      code: code,
    });

    return true;
  } catch (error) {
    console.error(
      "Error while creating verification doc in firestore: \n",
      error
    );
    return false;
  }
}

async function sendEmailVerificationCode(email: string, code: number) {
  const sgApiKey = keys.SENDGRID_EMAIL_SERVICE_API_KEY;

  try {
    SG.setApiKey(sgApiKey);

    const data = {
      to: email,
      from: "auth@apidon.com",
      subject: `Verification Code for Apidon: ${code}`,
      text: `Hello, your verification code is: ${code}`,
      html: `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
    <html xmlns="http://www.w3.org/1999/xhtml">
    <head>
        <title>Verify Your Email Address</title>
        <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <style>
            /* Base Styles */
            body {
                font-family: Arial, sans-serif;
                margin: 0;
                padding: 0;
                color: #575757;
                line-height: 1.6;
            }
    
            .highlighted a {
                color: #1A87FB; /* Change color as desired */
                text-decoration: underline; /* Add underline */
            }
    
            a {
                color: #1A87FB;
                text-decoration: none;
            }
    
            /* Layout */
            .container {
                background-color: #f5f7f9;
                padding: 20px;
                width: 100%;
                max-width: 600px;
                margin: 0 auto;
            }
    
            .header {
                text-align: center;
            }
    
            .logo {
                width: 100px;
                height: auto; /* Maintain aspect ratio */
                display: block;
                margin: 10px auto;
            }
    
            .content {
                padding: 20px;
                background-color: #fff;
                border-radius: 4px;
            }
    
            .code {
                font-size: 18px;
                font-weight: bold;
                text-align: center;
                margin: 20px 0;
                background-color: #f2f2f2;
                padding: 10px;
                border-radius: 4px;
                display: inline-block;
            }
    
            .footer {
                text-align: center;
                padding: 10px 0;
            }
    
            /* Highlighting */
            .highlighted {
                font-weight: bold;
            }
        </style>
    </head>
    
    <body>
        <div class="container">
            <div class="header">
                <img src="https://app.apidon.com/og.png" alt="Apidon" class="logo" />
            </div>
            <div class="content">
                <p>Welcome to Apidon!</p>
                <p>Thank you for signing up. To verify your email address and complete your registration, please enter the following code:</p>
                <h2 class="code">${code}</h2>
                <p>If you have any questions, please don't hesitate to contact us at <a href="mailto:[support@apidon.com]">support@apidon.com</a> or visit our Help Center at <a href="[https://apidon.com]">Apidon</a>.</p>
            </div>
            <div class="footer">
                <p>Sincerely,</p>
                <p>The Apidon Team</p>
            </div>
        </div>
    </body>
    
    </html>
    `,
    };

    const result = (await SG.send(data))[0];

    if (result.statusCode >= 200 && result.statusCode <= 299) return true;

    console.error("Error while sending email: ", result);
    return false;
  } catch (error) {
    console.error("Error while sending email: ", error);
    return false;
  }
}

export const sendVerificationCode = onRequest(
  appCheckMiddleware(async (req, res) => {
    const { email, password } = req.body;

    const checkPropResult = checkProps(email, password);
    if (checkPropResult !== true) {
      res.status(422).send("Invalid props.");
      return;
    }

    const emailUnique = await isEmailUnique(email);
    if (emailUnique !== true) {
      res.status(422).send("Email is already taken.");
      return;
    }

    const code = generateSixDigitNumber();

    const createVerificationDocResult = await createVerificationDoc(
      email,
      code
    );
    if (createVerificationDocResult !== true) {
      res.status(500).json("Internal server error.");
      return;
    }

    const sendEmailVerificationCodeResult = await sendEmailVerificationCode(
      email,
      code
    );
    if (sendEmailVerificationCodeResult !== true) {
      res.status(500).send("Internal server error.");
      return;
    }

    res.status(200).send("Verification code sent.");
    return;
  })
);
