import app from "./firebaseSetup.js"
import { getFirestore, collection, setDoc, doc, getDoc, getDocs, query, where, increment, updateDoc, orderBy, deleteField, limit, runTransaction  } from "firebase/firestore"; 
import { getStorage, ref, uploadBytes, getDownloadURL } from "firebase/storage";
import {getUserId} from "./account.js"
const storage = getStorage(app);
const db = getFirestore(app);

//NOTE: image field should be a File or Blob object when inserting data into database, but should be a URL when getting data.
class Post{
    constructor(author, title, description, species, image, latitude, longitude, date, rating=0, id=-1){
        this.author = author;
        this.title = title;
        this.description = description;
        this.species = species;
        this.image = image;
        this.latitude = latitude;
        this.longitude = longitude;
        this.date = date;
        this.rating = rating;
        this.id = id;
    }
}

class Comment{
    constructor(text, author, date, rating=0, id=-1){
        this.text = text;
        this.author=author;
        this.rating=rating;
        this.date = date;
        this.id = id;
    }
}

class SpeciesIdentification extends Comment{
    constructor(species, text, author, date, rating=0, id=-1){
        super(text, author, date, rating, id);
        this.species=species;
    }
}

class UserProfileStatistics{
    constructor(accountCreationDate, isModerator, totalCommentRating, totalComments, totalPostRating, totalPosts, totalSpeciesIdentificationRating, totalSpeciesIdentifications, username){
        this.accountCreationDate = accountCreationDate;
        this.isModerator = isModerator;
        this.totalCommentRating = totalCommentRating;
        this.totalComments = totalComments;
        this.totalPostRating = totalPostRating;
        this.totalPosts = totalPosts;
        this.totalSpeciesIdentificationRating = totalSpeciesIdentificationRating;
        this.totalSpeciesIdentifications = totalSpeciesIdentifications;
        this.username = username;
    }
}

const postConverter = {
    toFirestore: (post) => {
        return {
                author: post.author,
                title: post.title,
                description: post.description,
                species: post.species,
                image: post.image,
                latitude: post.latitude,
                longitude: post.longitude,
                date: post.date,
                rating: post.rating,
            };
    },
    fromFirestore: (snapshot, options) => {
        const data = snapshot.data(options);
        return new Post(data.author, data.title, data.description, data.species, data.image, data.latitude, data.longitude, data.date, data.rating, snapshot.id);
    }
};

const commentConverter ={
    toFirestore: (comment) => {
        return {
            text: comment.text,
            author: comment.author,
            rating: comment.rating,
            date: comment.date
        };
    },
    fromFirestore: (snapshot, options) => {
        const data = snapshot.data(options);
        return new Comment(data.text, data.author, data.date, data.rating, snapshot.id);
    }
}

const speciesIdentificationConverter ={
    toFirestore: (speciesIdentification) => {
        return {
            species: speciesIdentification.species,
            text: speciesIdentification.text,
            author: speciesIdentification.author,
            rating: speciesIdentification.rating,
            date: speciesIdentification.date
        };
    },
    fromFirestore: (snapshot, options) => {
        const data = snapshot.data(options);
        return new SpeciesIdentification(data.species, data.text, data.author, data.date, data.rating, snapshot.id);
    }
}

const userProfileStatisticsConverter ={
    toFirestore: (userProfileStatistics) => {
        return {
            username: userProfileStatistics.username,
            ismoderator: userProfileStatistics.isModerator,
            totalpostrating: userProfileStatistics.totalPostRating,
            totalposts: userProfileStatistics.totalPosts,
            totalcommentrating: userProfileStatistics.totalCommentRating,
            totalcomments: userProfileStatistics.totalComments,
            totalspeciesidentificationrating: userProfileStatistics.totalSpeciesIdentificationRating,
            totalspeciesidentifications: userProfileStatistics.totalSpeciesIdentifications,
            accountcreationdate: userProfileStatistics.accountCreationDate,
        };
    },
    fromFirestore: (snapshot, options) => {
        const data = snapshot.data(options);
        return new UserProfileStatistics(data.accountcreationdate, data.ismoderator, data.totalcommentrating, data.totalcomments, data.totalpostrating, data.totalposts, data.totalspeciesidentificationrating, data.totalspeciesidentifications, data.username);
    }
}

var currentUserVotedPosts;

var currentUserVotedComments;
var votedCommentsPost;

var currentUserVotedSpeciesIdentifications;
var votedSpeciesIdentificationsPost;

async function addNewPost(post){
    const newPostRef = doc(collection(db, "posts")).withConverter(postConverter);

    let imagePath = 'images/' + newPostRef.id;
    const storageRef = ref(storage, imagePath);
    await uploadBytes(storageRef, post.image);

    let imageURL = "";
    await getDownloadURL(ref(storage, imagePath))
    .then((url) => {
      imageURL = url;
    });
    
    post.image = imageURL;
    await setDoc(newPostRef,post);

    let userid = await getUserId();
    const userRef = doc(db, "users", userid);
    await updateDoc(userRef,{
        totalposts: increment(1),
    });

    const speciesIdentificationRef = doc(db, "species_identification", newPostRef.id);
    await setDoc(speciesIdentificationRef,{
        status: false,
        moderatorchosen: false,
        pinnedspeciesidentification: "",
        originalspecies: post.species,
    });

    return newPostRef.id;
}

async function addCommentToPost(comment, postId){
    const ref = doc(collection(db, 'comments/' + postId + '/comments')).withConverter(commentConverter);
    await setDoc(ref, comment);

    let userid = await getUserId();
    const userRef = doc(db, "users", userid);
    await updateDoc(userRef,{
        totalcomments: increment(1),
    });
}

async function addSpeciesIdentification(speciesIdentification, postId){
    const ref = doc(collection(db, 'species_identification/' + postId + '/comments')).withConverter(speciesIdentificationConverter);
    await setDoc(ref, speciesIdentification);

    let userid = await getUserId();
    const userRef = doc(db, "users", userid);
    await updateDoc(userRef,{
        totalspeciesidentifications: increment(1),
    });
}

async function getPostById(id){
    const ref = doc(db, "posts", id).withConverter(postConverter);
    const docSnap = await getDoc(ref);
    return docSnap.data();
}

//Returns a map of id (string) -> Post objects
async function getAllPosts(){
    const ref = collection(db, "posts").withConverter(postConverter);
    const q = query(ref, orderBy("rating","desc"), limit(5));
    const querySnapshot = await getDocs(q);
    let map = new Map();
    querySnapshot.forEach((doc) => {
        map.set(doc.id, doc.data());
    });
    return map;
}

async function getPostsBySpecies(species){
    const ref = collection(db, "posts").withConverter(postConverter);
    const q = query(ref, where("species", "==", species), orderBy("rating","desc"));
    const querySnapshot = await getDocs(q);
    let map = new Map();
    querySnapshot.forEach((doc) => {
        map.set(doc.id, doc.data());
    });
    return map;
}

async function getPostsByUsername(username){
    const ref = collection(db, "posts").withConverter(postConverter);
    const q = query(ref, where("author", "==", username), orderBy("rating","desc"));
    const querySnapshot = await getDocs(q);
    let map = new Map();
    querySnapshot.forEach((doc) => {
        map.set(doc.id, doc.data());
    });
    return map;
}

async function getPostsByLocation(longMax, longMin, latMax, latMin){
    const ref = collection(db, "posts").withConverter(postConverter);
    const q = query(ref, where("longitude", "<=", longMax), where("longitude", ">=", longMin));
    const querySnapshot = await getDocs(q);

    let arr = [];
    querySnapshot.forEach((doc) => {
        let currentLatitude = doc.data().latitude;
        if(currentLatitude <= latMax && currentLatitude >= latMin){
            arr.push(doc.data());
        }
    });

    arr.sort((a,b) => b.rating - a.rating);
    let map = new Map(arr.map(post => [post.id, post]));
    return map;
}

async function getPostsBySpeciesAndLocation(species, longMax, longMin, latMax, latMin){
    const ref = collection(db, "posts").withConverter(postConverter);
    const q = query(ref, where("species", "==", species), where("longitude", "<=", longMax), where("longitude", ">=", longMin));
    const querySnapshot = await getDocs(q);

    let arr = [];
    querySnapshot.forEach((doc) => {
        let currentLatitude = doc.data().latitude;
        if(currentLatitude <= latMax && currentLatitude >= latMin){
            arr.push(doc.data());
        }
    });
    arr.sort((a,b) => b.rating - a.rating);
    let map = new Map(arr.map(post => [post.id, post]));
    return map;
}

//Warning: Does not check if document with id postId exists
async function getCommentsByPost(postId){
    const ref = collection(db, "comments/" + postId + "/comments").withConverter(commentConverter);
    const q = query(ref, orderBy("rating","desc"));
    const querySnapshot = await getDocs(q);
    let map = new Map();
    querySnapshot.forEach((doc) => {
        map.set(doc.id, doc.data());
    });
    return map;
}

async function getSpeciesIdentificationByPost(postId){
    const ref = collection(db, "species_identification/" + postId + "/comments").withConverter(speciesIdentificationConverter);
    const q = query(ref, orderBy("rating","desc"));
    const querySnapshot = await getDocs(q);
    let map = new Map();
    querySnapshot.forEach((doc) => {
        map.set(doc.id, doc.data());
    });
    return map;
}

async function getUserProfileStatistics(username){
    const ref = collection(db, "users").withConverter(userProfileStatisticsConverter);
    const q = query(ref, where("username", "==", username));
    const querySnapshot = await getDocs(q);
    let profile;
    querySnapshot.forEach((doc) => {
        profile = doc.data();
    });
    return profile;
}

async function toggleIncrementPostRating(postId, postAuthor){
    let repeatVoteCheck = await hasUserLikedPost(postId);
    let deltaRating;
    let userid = await getUserId();
    const userRef = doc(db, "users_likes", userid);
    let path = 'votedposts.' + postId;
    if(repeatVoteCheck){
        deltaRating = -1;
    }
    else{
        let repeatVoteCheckOpp = await hasUserDislikedPost(postId);
        deltaRating = (repeatVoteCheckOpp)? 2: 1;
    }

    const ref = doc(collection(db, 'posts'), postId);
    await runTransaction(db, async (transaction) => {
        transaction.update(ref,{
            rating: increment(deltaRating)
        });
    });

    const authorRef = collection(db, "users");
    const q = query(authorRef, where("username", "==", postAuthor));
    const querySnapshot = await getDocs(q);
    querySnapshot.forEach((doc) => {
        runTransaction(db, async (transaction) => {
            transaction.update(doc.ref,{
                totalpostrating: increment(deltaRating)
            });
        });
    });

    if(repeatVoteCheck){
        currentUserVotedPosts.delete(postId);
        await runTransaction(db, async (transaction) => {
            transaction.update(userRef,{
                [path]: deleteField(),
            });
        });
    }
    else{
        currentUserVotedPosts.set(postId, true);
        await runTransaction(db, async (transaction) => {
            transaction.update(userRef,{
                [path]: true,
            });
        });
    }
    
    return true;
}

async function toggleDecrementPostRating(postId, postAuthor){
    let repeatVoteCheck = await hasUserDislikedPost(postId);
    let deltaRating;
    let userid = await getUserId();
    const userRef = doc(db, "users_likes", userid);
    let path = 'votedposts.' + postId;
    if(repeatVoteCheck){
        deltaRating = 1;
    }
    else{
        let repeatVoteCheckOpp = await hasUserLikedPost(postId);
        deltaRating = (repeatVoteCheckOpp)? -2: -1;
    }   
    
    const ref = doc(collection(db, 'posts'), postId);
    await runTransaction(db, async (transaction) => {
        transaction.update(ref,{
            rating: increment(deltaRating)
        });
    });

    const authorRef = collection(db, "users");
    const q = query(authorRef, where("username", "==", postAuthor));
    const querySnapshot = await getDocs(q);
    querySnapshot.forEach((doc) => {
        runTransaction(db, async (transaction) => {
            transaction.update(doc.ref,{
                totalpostrating: increment(deltaRating)
            });
        });
    });

    if(repeatVoteCheck){
        currentUserVotedPosts.delete(postId);
        await runTransaction(db, async (transaction) => {
            transaction.update(userRef,{
                [path]: deleteField(),
            });
        });
    }
    else{
        currentUserVotedPosts.set(postId, false);
        await runTransaction(db, async (transaction) => {
            transaction.update(userRef,{
                [path]: false,
            });
        });
    }

    return true;
}

async function toggleIncrementCommentRating(postId, commentId, commentAuthor){
    let repeatVoteCheck = await hasUserLikedComment(postId, commentId);
    let deltaRating;
    let userid = await getUserId();
    const userRef = doc(db, "users_likes", userid);
    let path = 'votedcomments.' + postId + '.' + commentId;
    if(repeatVoteCheck){
        deltaRating = -1;

        currentUserVotedComments.delete(commentId);
        await updateDoc(userRef,{
            [path]: deleteField(),
        });
    }
    else{
        repeatVoteCheck = await hasUserDislikedComment(postId, commentId);
        deltaRating = (repeatVoteCheck)? 2: 1;

        currentUserVotedComments.set(commentId, true);
        await updateDoc(userRef,{
            [path]: true,
        });
    }

    const ref = doc(collection(db, "comments/" + postId + "/comments"), commentId);
    updateDoc(ref,{
        rating: increment(deltaRating)
    });

    const authorRef = collection(db, "users");
    const q = query(authorRef, where("username", "==", commentAuthor));
    const querySnapshot = await getDocs(q);
    querySnapshot.forEach((doc) => {
        updateDoc(doc.ref,{
            totalcommentrating: increment(deltaRating)
        })
    });

    return true;
}

async function toggleDecrementCommentRating(postId, commentId, commentAuthor){
    let repeatVoteCheck = await hasUserDislikedComment(postId, commentId);
    let deltaRating;
    let userid = await getUserId();
    const userRef = doc(db, "users_likes", userid);
    let path = 'votedcomments.' + postId + '.' + commentId;
    if(repeatVoteCheck){
        deltaRating = 1;

        currentUserVotedComments.delete(commentId);
        await updateDoc(userRef,{
            [path]: deleteField(),
        });
    }
    else{
        repeatVoteCheck = await hasUserLikedComment(postId, commentId);
        deltaRating = (repeatVoteCheck)? -2: -1;

        currentUserVotedComments.set(commentId, false);
        await updateDoc(userRef,{
            [path]: false,
        });
    }
    const ref = doc(collection(db, "comments/" + postId + "/comments"), commentId);
    updateDoc(ref,{
        rating: increment(deltaRating)
    });

    const authorRef = collection(db, "users");
    const q = query(authorRef, where("username", "==", commentAuthor));
    const querySnapshot = await getDocs(q);
    querySnapshot.forEach((doc) => {
        updateDoc(doc.ref,{
            totalcommentrating: increment(deltaRating)
        })
    });

    return true;
}

async function toggleIncrementSpeciesIdentificationRating(postId, speciesIdentificationId, speciesIdentificationAuthor){
    let repeatVoteCheck = await hasUserLikedSpeciesIdentification(postId, speciesIdentificationId);
    let deltaRating;
    let userid = await getUserId();
    const userRef = doc(db, "users_likes", userid);
    let path = 'votedspeciesidentifications.' + postId + '.' + speciesIdentificationId;

    if(repeatVoteCheck){
        deltaRating = -1;
    }
    else{
        let repeatVoteCheckOpp = await hasUserDislikedSpeciesIdentification(postId, speciesIdentificationId);
        deltaRating = (repeatVoteCheckOpp)? 2: 1;
    }

    const ref = doc(collection(db, "species_identification/" + postId + "/comments"), speciesIdentificationId);
    await runTransaction(db, async (transaction) => {
        transaction.update(ref,{
            rating: increment(deltaRating)
        });
    });

    const authorRef = collection(db, "users");
    const q = query(authorRef, where("username", "==", speciesIdentificationAuthor));
    const querySnapshot = await getDocs(q);
    querySnapshot.forEach((doc) => {
        runTransaction(db, async (transaction) => {
            transaction.update(doc.ref,{
                totalspeciesidentificationrating: increment(deltaRating)
            });
        });
    });

    if(repeatVoteCheck){
        currentUserVotedSpeciesIdentifications.delete(speciesIdentificationId);
        await runTransaction(db, async (transaction) => {
            transaction.update(userRef,{
                [path]: deleteField(),
            });
        });
    }
    else{
        currentUserVotedSpeciesIdentifications.set(speciesIdentificationId, true);
        await runTransaction(db, async (transaction) => {
            transaction.update(userRef,{
                [path]: true,
            });
        });
    }

    await autoUpdateSpecies(postId);
    return true;
}

async function toggleDecrementSpeciesIdentificationRating(postId, speciesIdentificationId, speciesIdentificationAuthor){
    let repeatVoteCheck = await hasUserDislikedSpeciesIdentification(postId, speciesIdentificationId);
    let deltaRating;
    let userid = await getUserId();
    const userRef = doc(db, "users_likes", userid);
    let path = 'votedspeciesidentifications.' + postId + '.' + speciesIdentificationId;

    if(repeatVoteCheck){
        deltaRating = 1;
    }
    else{
        let repeatVoteCheckOpp = await hasUserLikedSpeciesIdentification(postId, speciesIdentificationId);
        deltaRating = (repeatVoteCheckOpp)? -2: -1;
    }

    const ref = doc(collection(db, "species_identification/" + postId + "/comments"), speciesIdentificationId);
    await runTransaction(db, async (transaction) => {
        transaction.update(ref,{
            rating: increment(deltaRating)
        });
    });

    const authorRef = collection(db, "users");
    const q = query(authorRef, where("username", "==", speciesIdentificationAuthor));
    const querySnapshot = await getDocs(q);
    querySnapshot.forEach((doc) => {
        runTransaction(db, async (transaction) => {
            transaction.update(doc.ref,{
                totalspeciesidentificationrating: increment(deltaRating)
            });
        });
    });

    if(repeatVoteCheck){
        currentUserVotedSpeciesIdentifications.delete(speciesIdentificationId);
        await runTransaction(db, async (transaction) => {
            transaction.update(userRef,{
                [path]: deleteField(),
            });
        });
    }
    else{
        currentUserVotedSpeciesIdentifications.set(speciesIdentificationId, false);
        await runTransaction(db, async (transaction) => {
            transaction.update(userRef,{
                [path]: false,
            });
        });
    }
    
    await autoUpdateSpecies(postId);
    return true;
}

async function hasUserLikedPost(postId){
    await getVotedPosts();

    if(currentUserVotedPosts.get(postId) === true){
        return true;
    }
    return false;
}
async function hasUserDislikedPost(postId){
    await getVotedPosts();

    if(currentUserVotedPosts.get(postId) === false){
        return true;
    }
    return false;
}

async function hasUserLikedComment(postId, commentId){
    await getVotedComments(postId);
    if(currentUserVotedComments.get(commentId) === true){
        return true;
    }
    return false;
}
async function hasUserDislikedComment(postId, commentId){
    await getVotedComments(postId);
    if(currentUserVotedComments.get(commentId) === false){
        return true;
    }
    return false;
}

async function hasUserLikedSpeciesIdentification(postId, speciesIdentificationId){
    await getVotedSpeciesIdentifications(postId);
    if(currentUserVotedSpeciesIdentifications.get(speciesIdentificationId) === true){
        return true;
    }
    return false;
}
async function hasUserDislikedSpeciesIdentification(postId, speciesIdentificationId){
    await getVotedSpeciesIdentifications(postId);
    if(currentUserVotedSpeciesIdentifications.get(speciesIdentificationId) === false){
        return true;
    }
    return false;
}

//Helper functions, ignore
async function getVotedPosts(){
    let userid = await getUserId();
    const userRef = doc(db, "users_likes", userid);
    const docSnap = await getDoc(userRef);
    if(docSnap.data().votedposts === undefined){
        currentUserVotedPosts = new Map();
    }
    else{
        currentUserVotedPosts = new Map(Object.entries(docSnap.data().votedposts));
    }
}

async function getVotedComments(postId){
    let userid = await getUserId();
    const userRef = doc(db, "users_likes", userid);
    const docSnap = await getDoc(userRef);
    if(docSnap.data().votedcomments === undefined || docSnap.data().votedcomments[postId] === undefined){
        currentUserVotedComments = new Map();
    }
    else{
        currentUserVotedComments = new Map(Object.entries(docSnap.data().votedcomments[postId]));
    }
    votedCommentsPost = postId;
}

async function getVotedSpeciesIdentifications(postId){
    let userid = await getUserId();
    const userRef = doc(db, "users_likes", userid);
    const docSnap = await getDoc(userRef);
    if(docSnap.data().votedspeciesidentifications === undefined || docSnap.data().votedspeciesidentifications[postId] === undefined){
        currentUserVotedSpeciesIdentifications = new Map();
    }
    else{
        currentUserVotedSpeciesIdentifications = new Map(Object.entries(docSnap.data().votedspeciesidentifications[postId]));
    }
    votedSpeciesIdentificationsPost = postId;
}


async function autoUpdateSpecies(postId){
    const speciesIdentificationMetaDataRef = doc(db, "species_identification", postId);
    const postRef = doc(db, "posts", postId);
    const docSnap = await getDoc(speciesIdentificationMetaDataRef);
    if(docSnap.data().moderatorchosen === true){ return; }

    const ref = collection(db, "species_identification/" + postId + "/comments");
    const q = query(ref, orderBy("rating","desc"), limit(1));
    const querySnapshot = await getDocs(q);
    
    let isThresholdReached = false;
    querySnapshot.forEach((doc) => {
        if(doc.data().rating >= 3){
            isThresholdReached = true;
            updateDoc(speciesIdentificationMetaDataRef,{
                pinnedspeciesidentification: doc.id,
            });
            updateDoc(postRef,{
                species: doc.data().species,
            });
        }
    });

    if(!isThresholdReached){
        await updateDoc(postRef,{
            species: docSnap.data().originalspecies,
        });
        await updateDoc(speciesIdentificationMetaDataRef,{
            pinnedspeciesidentification: "",
        });
    }
}

export {Post, Comment, SpeciesIdentification, 
    addNewPost, getPostById, getAllPosts, getPostsBySpecies, getPostsByLocation, getPostsBySpeciesAndLocation, getPostsByUsername,
    addCommentToPost, getCommentsByPost, 
    addSpeciesIdentification, getSpeciesIdentificationByPost,
    getUserProfileStatistics,
    hasUserLikedPost, hasUserDislikedPost, hasUserLikedComment, hasUserDislikedComment, hasUserLikedSpeciesIdentification, hasUserDislikedSpeciesIdentification,
    //These following functions have a second/third parameter *Author which is the author of the post/comment/species identification. This parameter is here to reduce the amount of
    //communication needed to the cloud because these functions are assumed to only be used once you already have gotten data from the post document
    //which includes the post author.
    toggleIncrementPostRating, toggleDecrementPostRating, toggleIncrementCommentRating, toggleDecrementCommentRating, toggleIncrementSpeciesIdentificationRating, toggleDecrementSpeciesIdentificationRating,
    autoUpdateSpecies, //WARNING: THIS FUNCTION SHOULD ONLY BE IMPORTED IN moderation.js
    };