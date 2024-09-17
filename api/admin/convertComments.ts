import { onRequest } from "firebase-functions/v2/https";

import { firestore } from "../../firebase/adminApp";

import {
  CommentServerData,
  PostsDocData,
  PostServerDataOld,
} from "../../types/Post";
import { FieldValue } from "firebase-admin/firestore";

async function getPostDocPaths() {
  try {
    const postsDocSnapshot = await firestore.doc("/posts/posts").get();

    if (!postsDocSnapshot.exists) {
      console.error("Posts document does not exist");
      return false;
    }

    const postsDocData = postsDocSnapshot.data() as PostsDocData;

    if (!postsDocData) {
      console.error("Posts document data is undefined");
      return false;
    }

    const postDocPathArrayItems = postsDocData.postDocPaths;

    return postDocPathArrayItems.map((p) => p.postDocPath);
  } catch (error) {
    console.error("Error getting post doc paths:", error);
    return false;
  }
}

async function getPostData(postDocPath: string) {
  try {
    const postDocSnapshot = await firestore.doc(postDocPath).get();
    if (!postDocSnapshot.exists) {
      console.error("Post document does not exist");
      return false;
    }
    const postDocData = postDocSnapshot.data() as PostServerDataOld;

    if (!postDocData) {
      console.error("Post document data is undefined");
      return false;
    }
    return postDocData;
  } catch (error) {
    console.error("Error getting post data:", error);
    return false;
  }
}

async function getAllPostDatas(postDocPaths: string[]) {
  try {
    const allPostDocDatas = await Promise.all(
      postDocPaths.map((postDocPath) => getPostData(postDocPath))
    );

    const filtered = allPostDocDatas.filter(
      (postDocData) => postDocData !== false
    ) as PostServerDataOld[];

    return filtered;
  } catch (error) {
    console.error("Error getting all post datas:", error);
    return false;
  }
}

async function addCommentDocToCommentsCollection(
  commentServerData: CommentServerData,
  postDocPath: string
) {
  try {
    await firestore
      .collection(`${postDocPath}/comments`)
      .add(commentServerData);
    return true;
  } catch (error) {
    console.error("Error adding comment doc to comments collection:", error);
    return false;
  }
}

async function convertPost(postDocData: PostServerDataOld) {
  const comments = postDocData.comments || [];

  const postDocPath = `users/${postDocData.senderUsername}/posts/${postDocData.id}`;

  for (const comment of comments) {
    await addCommentDocToCommentsCollection(comment, postDocPath);
  }

  try {
    await firestore.doc(postDocPath).update({ comments: FieldValue.delete() });
    return true;
  } catch (error) {
    console.error("Error converting post:", error);
    return false;
  }
}

async function convertAllPosts(allPostDocDatas: PostServerDataOld[]) {
  try {
    const converted = await Promise.all(
      allPostDocDatas.map((postDocData) => convertPost(postDocData))
    );
    return converted.every((v) => v === true);
  } catch (error) {
    console.error("Error converting all posts:", error);
    return false;
  }
}

export const convertComments = onRequest(async (req, res) => {
  const postDocPaths = await getPostDocPaths();
  if (!postDocPaths) {
    console.error("Error getting post doc paths");
    res.status(500).send("Error getting post doc paths");
    return;
  }

  const allPostDocDatas = await getAllPostDatas(postDocPaths);
  if (!allPostDocDatas) {
    console.error("Error getting all post datas");
    res.status(500).send("Error getting all post datas");
    return;
  }

  const converted = await convertAllPosts(allPostDocDatas);
  if (!converted) {
    console.error("Error converting all posts");
    res.status(500).send("Error converting all posts");
    return;
  }
  res.status(200).send("Success");
});
