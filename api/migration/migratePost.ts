import {
  CommentServerData,
  PostDataOnMainPostsCollectionOld,
  PostMigrateStructure,
  PostServerDataOld,
  RatingData,
} from "../../types/Post";
import { handleAdminAuthorization } from "../../helpers/handleAdminAuthorization";
import { onRequest } from "firebase-functions/https";
import { firestore } from "../../firebase/adminApp";
import { CollectibleDocData, CollectorDocData } from "../../types/Collectible";

async function getPostDataOnMainCollection() {
  try {
    const postsDocCollection = await firestore.collection("posts").get();

    return postsDocCollection.docs.map(
      (d) => d.data() as PostDataOnMainPostsCollectionOld
    );
  } catch (error) {
    console.error("Error getting post doc paths:", error);
    return false;
  }
}

async function getPostData(postDocPath: string) {
  try {
    const postDocSnapshot = await firestore.doc(postDocPath).get();
    if (!postDocSnapshot.exists) {
      console.error("Post document does not exist for: ", postDocPath);
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

async function getRatingDatas(postDocPath: string) {
  try {
    const ratingDocCollection = await firestore
      .collection(`${postDocPath}/ratings`)
      .get();
    return ratingDocCollection.docs.map((d) => d.data() as RatingData);
  } catch (error) {
    console.error("Error getting rating datas:", error);
    return false;
  }
}

async function getCommentDatas(postDocPath: string) {
  try {
    const commentDocCollection = await firestore
      .collection(`${postDocPath}/comments`)
      .get();
    return commentDocCollection.docs.map((d) => d.data() as CommentServerData);
  } catch (error) {
    console.error("Error getting comment datas:", error);
    return false;
  }
}

async function createPostMigrateStructureForOnePost(
  postDataFromMainPostCollection: PostDataOnMainPostsCollectionOld
) {
  const postDocPath = postDataFromMainPostCollection.postDocPath;

  // Get post data from post document
  const postServerData = await getPostData(postDocPath);
  if (!postServerData) {
    console.error("Error getting post data");
    return false;
  }

  // Get Rating Docs
  const ratingDatas = await getRatingDatas(postDocPath);
  if (!ratingDatas) {
    console.error("Error getting rating datas");
    return false;
  }

  // Get Comment Docs
  const commentDatas = await getCommentDatas(postDocPath);
  if (!commentDatas) {
    console.error("Error getting comment datas");
    return false;
  }

  const migrateStructure: PostMigrateStructure = {
    comments: commentDatas,
    newPostDocData: {
      collectibleStatus: postServerData.collectibleStatus,
      commentCount: postServerData.commentCount || 0,
      description: postServerData.description || "",
      id: postServerData.id,
      image: postServerData.image || "",
      postDocPath: postDataFromMainPostCollection.postDocPath,
      ratingCount: postServerData.ratingCount || 0,
      ratingSum: postServerData.ratingSum || 0,
      reviewStatus: postServerData.reviewStatus || "pending",
      senderUsername: postServerData.senderUsername,
      timestamp: postServerData.creationTime,
      reportCount: postDataFromMainPostCollection.reportCount || 0,
    },
    rates: ratingDatas,
  };

  return migrateStructure;
}

async function createPostMigrationDataForAllPosts(
  postDatasFromMainPostCollection: PostDataOnMainPostsCollectionOld[]
) {
  const allPostMigrationStructures = await Promise.all(
    postDatasFromMainPostCollection.map(createPostMigrateStructureForOnePost)
  );

  const filtered = allPostMigrationStructures.filter(
    (postMigrationData) => postMigrationData !== false
  ) as PostMigrateStructure[];

  return filtered;
}

async function migrateRatings(newPostDocPath: string, ratings: RatingData[]) {
  const ratingCollection = firestore.doc(newPostDocPath).collection("ratings");

  try {
    await Promise.all(
      ratings.map(async (ratingData) => {
        await ratingCollection.add(ratingData);
      })
    );
    return true;
  } catch (error) {
    console.error("Error adding ratings:", error);
    return false;
  }
}

async function migrateComments(
  newPostDocPath: string,
  comments: CommentServerData[]
) {
  const commentCollection = firestore
    .doc(newPostDocPath)
    .collection("comments");

  try {
    await Promise.all(
      comments.map(async (commentData) => {
        await commentCollection.add(commentData);
      })
    );
    return true;
  } catch (error) {
    console.error("Error adding comments:", error);
    return false;
  }
}

async function updateCollectibleCodeData(
  oldPostDocPath: string,
  newPostDocPath: string
) {
  try {
    const collectibleCodeDocs = await firestore
      .collection("collectibleCodes")
      .where("postDocPath", "==", oldPostDocPath)
      .get();
    if (collectibleCodeDocs.docs.length === 0) {
      return true;
    }

    await Promise.all(
      collectibleCodeDocs.docs.map(async (d) => {
        await d.ref.update({ postDocPath: newPostDocPath });
      })
    );

    return true;
  } catch (error) {
    console.error("Error updating collectible code data:", error);
    return false;
  }
}

async function updateCollectibleData(
  oldPostDocPath: string,
  newPostDocPath: string
) {
  try {
    const collectibleDocsQuery = await firestore
      .collection("collectibles")
      .where("postDocPath", "==", oldPostDocPath)
      .get();
    if (collectibleDocsQuery.docs.length === 0) {
      console.error("Collectible not found for old path is: ", oldPostDocPath);
      return false;
    }

    await collectibleDocsQuery.docs[0].ref.update({
      postDocPath: newPostDocPath,
    });

    return true;
  } catch (error) {
    console.error("Error updating collectible data:", error);
    return false;
  }
}

async function migrateOnePost(postMigrationStructure: PostMigrateStructure) {
  // Delete Post From Main Collection
  try {
    const postDocOnMainCollectionDoc = await firestore
      .collection("posts")
      .where(
        "postDocPath",
        "==",
        postMigrationStructure.newPostDocData.postDocPath
      )
      .get();

    if (postDocOnMainCollectionDoc.docs.length === 0) {
      console.error("Post doc not found on main collection");
      return false;
    }

    await postDocOnMainCollectionDoc.docs[0].ref.delete();
  } catch (error) {
    console.error("Error deleting post from main collection:", error);
    return false;
  }

  // Delete Post From User's Post Collection
  try {
    await firestore
      .doc(postMigrationStructure.newPostDocData.postDocPath)
      .delete();
  } catch (error) {
    console.error("Error deleting post from user's collection:", error);
    return false;
  }

  // Create New Post Document
  let newPostDocPath: string;
  try {
    const postCollection = firestore.collection("posts");
    const result = await postCollection.add(
      postMigrationStructure.newPostDocData
    );

    newPostDocPath = result.path;
  } catch (error) {
    console.error("Error creating new post document:", error);
    return false;
  }

  if (newPostDocPath[0] === "/") {
    newPostDocPath = newPostDocPath.slice(1);
  }

  // Add Ratings
  const ratingsMigrated = await migrateRatings(
    newPostDocPath,
    postMigrationStructure.rates
  );
  if (!ratingsMigrated) {
    console.error("Error migrating ratings");
    return false;
  }

  // Add Comments
  const commentsMigrated = await migrateComments(
    newPostDocPath,
    postMigrationStructure.comments
  );
  if (!commentsMigrated) {
    console.error("Error migrating comments");
    return false;
  }

  // Update Collectible Code Data
  if (postMigrationStructure.newPostDocData.collectibleStatus.isCollectible) {
    const collectibleCodeDataUpdated = await updateCollectibleCodeData(
      postMigrationStructure.newPostDocData.postDocPath,
      newPostDocPath
    );
    if (!collectibleCodeDataUpdated) {
      console.error("Error updating collectible code data");
      return false;
    }
  }

  // Update Collectible Data
  if (postMigrationStructure.newPostDocData.collectibleStatus.isCollectible) {
    const collectibleDataUpdated = await updateCollectibleData(
      postMigrationStructure.newPostDocData.postDocPath,
      newPostDocPath
    );
    if (!collectibleDataUpdated) {
      console.error("Error updating collectible data");
      return false;
    }
  }

  return true;
}

async function migrateAllPosts(postMigrationData: PostMigrateStructure[]) {
  try {
    await Promise.all(postMigrationData.map(migrateOnePost));
    return true;
  } catch (error) {
    console.error("Error migrating all posts:", error);
    return false;
  }
}

async function updateIdAndPostDocPathOfNewPost() {
  try {
    const newPostDocs = await firestore.collection("posts").get();

    await Promise.all(
      newPostDocs.docs.map(async (doc) => {
        await doc.ref.update({
          id: doc.id,
          postDocPath:
            doc.ref.path[0] === "/" ? doc.ref.path.slice(1) : doc.ref.path,
        });
      })
    );

    return true;
  } catch {
    console.error("Error updating id and post doc path of new post");
    return false;
  }
}

async function getCollectibles() {
  try {
    const collectiblesQuery = await firestore.collection("collectibles").get();

    return collectiblesQuery.docs.map((d) => d.data() as CollectibleDocData);
  } catch (error) {
    console.error("Error getting collectibles:", error);
    return false;
  }
}

async function handleUpdatePostDocPathCreatedCollectiblesOfCollectibleSender(
  sender: string,
  collectibleDocPath: string,
  newPostDocPath: string
) {
  try {
    const createdCollectibleDocQuery = await firestore
      .collection("users")
      .doc(sender)
      .collection("collectible")
      .doc("trade")
      .collection("createdCollectibles")
      .where("collectibleDocPath", "==", collectibleDocPath)
      .get();

    if (!createdCollectibleDocQuery.docs.length) {
      console.error("No created collectibles found for sender:", sender);
      return false;
    }

    await createdCollectibleDocQuery.docs[0].ref.update({
      postDocPath: newPostDocPath,
    });

    return true;
  } catch (error) {
    console.error(
      "Error updating post doc path of created collectibles:",
      error
    );
    return false;
  }
}

async function getCollectorsOfCollectible(collectibleDocPath: string) {
  try {
    const collectorDocs = await firestore
      .doc(collectibleDocPath)
      .collection("collectors")
      .get();
    return collectorDocs.docs.map((d) => d.data() as CollectorDocData);
  } catch (error) {
    console.error("Error getting collectors of collectible:", error);
    return false;
  }
}

async function updatePostDocPathOfBoughtCollectibleDocOfOneUser(
  collector: string,
  collectibleDocPath: string,
  newPostDocPath: string
) {
  try {
    const boughtCollectibleDocQuery = await firestore
      .collection("users")
      .doc(collector)
      .collection("collectible")
      .doc("trade")
      .collection("boughtCollectibles")
      .where("collectibleDocPath", "==", collectibleDocPath)
      .get();

    if (!boughtCollectibleDocQuery.docs.length) {
      console.error(
        "No bought collectibles found for collector:",
        collector,
        collectibleDocPath,
        newPostDocPath
      );
      return true;
    }

    await boughtCollectibleDocQuery.docs[0].ref.update({
      postDocPath: newPostDocPath,
    });

    return true;
  } catch (error) {
    console.error(
      "Error updating post doc path of bought collectibles:",
      error,
      collector,
      collectibleDocPath,
      newPostDocPath
    );
    return false;
  }
}

async function handleUpdatePostPathBoughtCollectiblesOfCollectors(
  collectors: string[],
  collectibleDocPath: string,
  newPostDocPath: string
) {
  try {
    await Promise.all(
      collectors.map((collector) =>
        updatePostDocPathOfBoughtCollectibleDocOfOneUser(
          collector,
          collectibleDocPath,
          newPostDocPath
        )
      )
    );
    return true;
  } catch (error) {
    console.error(
      "Error updating post doc path of bought collectibles:",
      error
    );
    return false;
  }
}

async function handleOneCollectible(collectibleDocData: CollectibleDocData) {
  const updatedCreatedColResult =
    await handleUpdatePostDocPathCreatedCollectiblesOfCollectibleSender(
      collectibleDocData.creator,
      `collectibles/${collectibleDocData.id}`,
      collectibleDocData.postDocPath
    );
  if (!updatedCreatedColResult) {
    console.error(
      "Error updating created collectibles of sender:",
      collectibleDocData.creator
    );
    return false;
  }

  const collectors = await getCollectorsOfCollectible(
    `collectibles/${collectibleDocData.id}`
  );
  if (!collectors) {
    console.error("Error getting collectors of collectible");
    return false;
  }

  const updatedBoughtColResult =
    await handleUpdatePostPathBoughtCollectiblesOfCollectors(
      collectors.map((collector) => collector.username),
      `collectibles/${collectibleDocData.id}`,
      collectibleDocData.postDocPath
    );
  if (!updatedBoughtColResult) {
    console.error("Error updating bought collectibles of collectors");
    return false;
  }

  return true;
}

async function handleAllCollectibles(
  collectibleDocDatas: CollectibleDocData[]
) {
  try {
    await Promise.all(collectibleDocDatas.map(handleOneCollectible));
    return true;
  } catch (error) {
    console.error("Error handling all collectibles:", error);
    return false;
  }
}

export const migratePost = onRequest(async (req, res) => {
  const { authorization } = req.headers;

  const authResult = handleAdminAuthorization(authorization);
  if (!authResult) {
    res.status(401).send("Unauthorized");
    return;
  }

  const postDatasFromMainCollection = await getPostDataOnMainCollection();
  if (!postDatasFromMainCollection) {
    res.status(500).send("Error getting post datas from main collection");
    return;
  }

  const postMigrationData = await createPostMigrationDataForAllPosts(
    postDatasFromMainCollection
  );
  if (!postMigrationData) {
    res.status(500).send("Error creating post migration data");
    return;
  }

  const allPostsMigrated = await migrateAllPosts(postMigrationData);
  if (!allPostsMigrated) {
    res.status(500).send("Error migrating all posts");
    return;
  }

  const idAndPostDocPathUpdated = await updateIdAndPostDocPathOfNewPost();
  if (!idAndPostDocPathUpdated) {
    res.status(500).send("Error updating id and post doc path of new post");
    return;
  }

  const collectibleDocDatas = await getCollectibles();
  if (!collectibleDocDatas) {
    res.status(500).send("Error getting collectibles");
    return;
  }

  const allCollectiblesHandled = await handleAllCollectibles(
    collectibleDocDatas
  );
  if (!allCollectiblesHandled) {
    res.status(500).send("Error handling all collectibles");
    return;
  }

  res.status(200).send("All posts migrated successfully");
});
