import { onRequest } from "firebase-functions/v2/https";
import { firestore, auth } from "../../../../firebase/adminApp";
import { keys } from "../../../../config";

import * as sg from "@sendgrid/mail";
import { appCheckMiddleware } from "../../../../middleware/appCheckMiddleware";

function checkProps(
  referralCode: string,
  email: string,
  password: string,
  username: string,
  fullname: string
) {
  if (!referralCode || !email || !password || !username || !fullname) {
    console.error("Invalid Props");
    return false;
  }
  return true;
}

function generateSixDigitNumber(): number {
  // Generate a random number between 100000 and 999999
  return Math.floor(100000 + Math.random() * 900000);
}

const quickRegexCheck = (
  email: string,
  password: string,
  username: string,
  fullname: string
) => {
  // Email
  const emailRegex =
    /^[A-Za-z0-9._%+-]+@(gmail|yahoo|outlook|aol|icloud|protonmail|yandex|mail|zoho)\.(com|net|org)$/i;
  const regexTestResultE = emailRegex.test(email);

  if (!regexTestResultE) return "email";

  // Password

  const passwordRegex =
    // @ts-ignore
    /^(?=.*?\p{Lu})(?=.*?\p{Ll})(?=.*?\d)(?=.*?[^\w\s]|[_]).{12,}$/u;
  const regexTestResultP = passwordRegex.test(password);

  if (!regexTestResultP) return "password";

  // Username
  const usernameRegex = /^[a-z0-9]{4,20}$/;
  const regexTestResultU = usernameRegex.test(username);

  if (!regexTestResultU) return "username";

  // Fullname
  // @ts-ignore
  const fullnameRegex = /^\p{L}{1,20}(?: \p{L}{1,20})*$/u;
  const regexTestResultF = fullnameRegex.test(fullname);

  if (!regexTestResultF) return "fullname";

  return true;
};

export const sendVerificationCode = onRequest(
  appCheckMiddleware(async (req, res) => {
    const { referralCode, email, password, username, fullname } = req.body;

    const checkPropsResult = checkProps(
      referralCode,
      email,
      password,
      username,
      fullname
    );

    if (!checkPropsResult) {
      res.status(422).json({
        cause: "server",
        message: "Invalid props.",
      });
      return;
    }

    const regexTestResult = quickRegexCheck(
      email,
      password,
      username,
      fullname
    );
    if (regexTestResult !== true) {
      res.status(422).json({
        cause: regexTestResult,
        message: "Invalid Prop",
      });
      return;
    }

    if (!regexTestResult) {
      res.status(422).json({
        cause: "email",
        message: "Invalid Email.",
      });
      return;
    }

    try {
      const referralCodeDocSnapshot = await firestore
        .doc(`/references/${referralCode}`)
        .get();
      if (!referralCodeDocSnapshot.exists) {
        res.status(422).json({
          cause: "referralCode",
          message: "Referral code is invalid.",
        });
        return;
      }

      const data = referralCodeDocSnapshot.data();

      if (data === undefined) {
        console.error("Refferal code exists but its data is undefined.");
        res.status(500).json({
          cause: "server",
          message: "Internal Server Error",
        });
        return;
      }

      const inProcess = data.inProcess;
      const isUsed = data.isUsed;

      if (isUsed || inProcess) {
        res.status(422).json({
          cause: "referralCode",
          message: "Referral code has already been used.",
        });
        return;
      }
    } catch (error) {
      console.error("Error on checking referral code: \n", error);
      res.status(422).json({
        cause: "server",
        message: "Internal server error.",
      });
      return;
    }

    // Check if this email used before.
    try {
      await auth.getUserByEmail(email);
      res.status(422).json({
        cause: "email",
        message: "This email is used by another account.",
      });
      return;
    } catch (error) {
      // Normal Situation
      // There is no account linked with requested email.
    }

    // username validity check (If it is taken or not.)
    try {
      const userDocSnapshot = await firestore
        .doc(`usernames/${username}`)
        .get();
      if (userDocSnapshot.exists) {
        res.status(422).json({
          cause: "username",
          message: "Username is taken.",
        });
        return;
      }
      // So If there is no doc, no problem.
    } catch (error) {
      console.error(
        "Error on checking username validity: (If it is valid or not.): \n",
        error
      );
      res.status(500).json({
        cause: "server",
        message: "Internal server error.",
      });
      return;
    }

    // Creating verification code...
    const verificationCode = generateSixDigitNumber();
    try {
      await firestore.doc(`emailVerifications/${email}`).set({
        code: verificationCode,
      });
    } catch (error) {
      console.error(
        "Error while creating verificationCode doc in firestore: \n",
        error
      );
      res.status(500).json({
        cause: "server",
        message: "Internal Server Error",
      });
      return;
    }

    // Send Email Verification Code
    const sgApiKey = keys.SENDGRID_EMAIL_SERVICE_API_KEY;
    if (!sgApiKey) {
      res.status(500).json({
        cause: "server",
        message: "Internal Server Error",
      });
      return console.error("Error on getting email verification api key: \n");
    }

    try {
      sg.setApiKey(sgApiKey);
      const message = {
        to: email,
        from: "auth@apidon.com",
        subject: `Verification Code for Apidon: ${verificationCode}`,
        text: `Hello, your verification code is: ${verificationCode}`,
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
                  <h2 class="code">${verificationCode}</h2>
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

      await sg.send(message);
    } catch (error) {
      console.error("Error on sending verification code: \n", error);
      // @ts-ignore
      console.error(error.response.body.errors);
      res.status(500).json({
        cause: "server",
        message: "Internal Server Error",
      });
      return;
    }

    res.status(200).send("Success");
    return;
  })
);
