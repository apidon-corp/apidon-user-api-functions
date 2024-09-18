import { onRequest } from "firebase-functions/v2/https";

import { firestore } from "../../firebase/adminApp";
import {
  PostDataOnMainPostsCollection,
  PostsDocData,
  PostServerData,
} from "../../types/Post";

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
    const postDocData = postDocSnapshot.data() as PostServerData;

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
    ) as PostServerData[];

    return filtered;
  } catch (error) {
    console.error("Error getting all post datas:", error);
    return false;
  }
}

async function createPostDocOnMainPostsCollection(
  postData: PostDataOnMainPostsCollection
) {
  if (!postData) return true;

  try {
    const mainPostsCollectionRef = firestore.collection("posts");
    await mainPostsCollectionRef.add(postData);
    return true;
  } catch (error) {
    console.error("Error creating post doc on main posts collection:", error);
    return false;
  }
}

async function convertOnePost(postDocData: PostServerData) {
  const newPostData: PostDataOnMainPostsCollection = {
    postDocPath: `users/${postDocData.senderUsername}/posts/${postDocData.id}`,
    sender: postDocData.senderUsername,
    timestamp: postDocData.creationTime,
  };
  return createPostDocOnMainPostsCollection(newPostData);
}

async function convertAllPosts(allPostDocDatas: PostServerData[]) {
  const convertPromises = allPostDocDatas.map(convertOnePost);

  const converted = await Promise.all(convertPromises);

  return converted.every((c) => c === true);
}

async function deletePostsDoc() {
  try {
    const postsDocRef = firestore.doc("/posts/posts");
    await postsDocRef.delete();
    return true;
  } catch (error) {
    console.error("Error deleting posts doc:", error);
    return false;
  }
}

export const convertPosts = onRequest(async (req, res) => {
  const postDocPaths = await getPostDocPaths();
  if (!postDocPaths) {
    res.status(500).send("Error getting post doc paths");
    return;
  }

  const allPostDocDatas = await getAllPostDatas(postDocPaths);
  if (!allPostDocDatas) {
    res.status(500).send("Error getting all post datas");
    return;
  }

  const converted = await convertAllPosts(allPostDocDatas);
  if (!converted) {
    res.status(500).send("Error converting posts");
    return;
  }

  const deleted = await deletePostsDoc();
  if (!deleted) {
    res.status(500).send("Error deleting posts doc");
    return;
  }

  res.status(200).send("Posts converted successfully");
});
