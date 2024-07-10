import { onRequest } from "firebase-functions/v2/https";

import * as express from "express";
import { keys } from "../../config";
import { firestore } from "../../firebase/adminApp";

import { PostServerDataV3 } from "../../types/Post";

/**
 * Handling cors policy stuff.
 * @param res
 */
function handlePreflightRequest(res: express.Response) {
  res.setHeader(
    "Access-Control-Allow-Origin",
    keys.API_ENDPOINT_TO_APIDON_PROVIDER_SERVER
  );
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,authorization");
  res.status(200).end();
}

function handleAuthorization(authorization: string | undefined) {
  if (!authorization) {
    console.error("Authorization key is undefined.");
    return false;
  }

  const apiKey = keys.API_KEY_BETWEEN_SERVICES;
  if (!apiKey) {
    console.error("API KEY is undefined in config file.");
    return false;
  }

  return authorization === apiKey;
}

function handleProps(postDocPath: string) {
  if (!postDocPath) return false;

  return true;
}

async function preparePostDataResult(postDocPath: string) {
  try {
    const postDocSnapshot = await firestore.doc(postDocPath).get();

    if (!postDocSnapshot.exists) {
      console.error("This doc doesn't exist anymore: ", postDocPath);
      return {
        postDocData: false,
      };
    }

    const postDocData = postDocSnapshot.data() as PostServerDataV3;
    if (postDocData === undefined) {
      console.error("Post doc data is undefined.");
      return false;
    }

    return {
      postDocData: postDocData,
    };
  } catch (error) {
    console.error("Error on preparing post data: \n", error);
    return false;
  }
}

export const providePostInformation = onRequest(async (req, res) => {
  if (req.method === "OPTIONS") {
    handlePreflightRequest(res);
    return;
  }

  if (req.method !== "POST") {
    res.status(405).send("Method not allowed");
    return;
  }

  const { authorization } = req.headers;
  const { postDocPath } = req.body;

  const authorizationResult = handleAuthorization(authorization);
  if (!authorizationResult) {
    res.status(401).send("Unauthorized");
    return;
  }

  const handlePropResult = handleProps(postDocPath);
  if (!handlePropResult) {
    res.status(422).send("Invalid prop or props");
    return;
  }

  const postDataResult = await preparePostDataResult(postDocPath);
  if (!postDataResult) {
    res.status(500).send("Internal server error");
    return;
  }

  res.status(200).json({
    postDocData: postDataResult.postDocData,
  });
  return;
});
