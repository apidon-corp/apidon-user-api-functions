import {onRequest} from "firebase-functions/v2/https";

import {firestore} from "../../../firebase/adminApp";

import {ReviewStatus} from "../../../types/Admin";

import * as express from "express";
import {handleAdminAuthorization} from "../../../helpers/handleAdminAuthorization";

function checkProps(id: string, senderUsername: string, reviewStatus: string) {
  if (!id || !senderUsername || !reviewStatus) return false;

  return true;
}

async function isThereAValidPost(id: string) {
  try {
    const postDocSnapshot = await firestore.doc(`posts/${id}`).get();

    if (!postDocSnapshot.exists) {
      console.error("Post not found");
      return false;
    }

    if (!postDocSnapshot.data()) {
      console.error("Post data is undefined");
      return false;
    }

    return true;
  } catch (error) {
    console.error("Error checking post:", error);
    return false;
  }
}

function checkReviewStatusValid(reviewStatus: ReviewStatus) {
  if (!reviewStatus) {
    console.error("Review status is missing");
    return false;
  }

  if (reviewStatus !== "approved" && reviewStatus !== "pending") {
    if (reviewStatus.status !== "rejected") {
      console.error("Invalid review status");
      return false;
    }

    const rejectionReason = reviewStatus.rejectionReason;
    if (!rejectionReason) {
      console.error("Rejection reason is missing");
      return false;
    }
  }

  return true;
}

async function updatePostReviewStatus(
  postDocPath: string,
  reviewStatus: ReviewStatus
) {
  try {
    const postDocRef = firestore.doc(postDocPath);

    await postDocRef.update({
      reviewStatus: reviewStatus,
    });

    return true;
  } catch (error) {
    console.error("Error updating post review status:", error);
    return false;
  }
}

/**
 * Handling CORS.
 * @param res
 */
function setCorsHeaders(res: express.Response) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,authorization");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
}

export const updatePostStatus = onRequest(async (req, res) => {
  setCorsHeaders(res);
  if (req.method === "OPTIONS") {
    res.status(200).end();
    return;
  }

  const {authorization} = req.headers;
  const {id, senderUsername, reviewStatus} = req.body;

  const authResult = handleAdminAuthorization(authorization);

  if (!authResult) {
    res.status(401).send("Unauthorized");
    return;
  }

  if (!checkProps(id, senderUsername, reviewStatus)) {
    res.status(422).send("Invalid Props");
    return;
  }

  const postResult = await isThereAValidPost(id);
  if (!postResult) {
    res
      .status(500)
      .send(
        "Post not found or an error occurred while checking the post (Internal Server Error)"
      );
    return;
  }

  const reviewStatusResult = checkReviewStatusValid(reviewStatus);
  if (!reviewStatusResult) {
    res.status(422).send("Invalid Review Status");
    return;
  }

  const postDocPath = `posts/${id}`;

  const updateResult = await updatePostReviewStatus(postDocPath, reviewStatus);
  if (!updateResult) {
    res
      .status(500)
      .send("An error occurred while updating the post review status.");
    return;
  }

  res.status(200).send("Post review status updated successfully");
  return;
});
