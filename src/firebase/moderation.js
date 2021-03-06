import app from "./firebaseSetup.js"
import { getFirestore, doc, updateDoc, getDoc} from "firebase/firestore"; 
import { getUserProfileStatistics, autoUpdateSpecies } from "./database.js";
import { getUsername } from "./account.js";
const db = getFirestore(app);

var profile;

class SpeciesIdentificationPostMetaData{
    constructor(pinnedSpeciesIdentification, status, moderatorChosen, originalSpecies){
        this.pinnedSpeciesIdentification = pinnedSpeciesIdentification;
        this.status = status;
        this.moderatorChosen = moderatorChosen;
        this.originalSpecies = originalSpecies;
    }
}

async function isUserModerator(){
    if(profile === undefined){
        let username = await getUsername();
        profile = await getUserProfileStatistics(username);
    }
    return profile.isModerator;
}

async function pinSpeciesIdentification(postId, speciesIdentificationId, speciesToPin){
    const speciesIdentificationRef = doc(db, "species_identification", postId);
    await updateDoc(speciesIdentificationRef,{
        pinnedspeciesidentification: speciesIdentificationId,
        moderatorchosen: true,
    });

    const postRef = doc(db, "posts", postId);
    await updateDoc(postRef,{
        species: speciesToPin,
    });
}

async function unpinSpeciesIdentification(postId){
    const speciesIdentificationRef = doc(db, "species_identification", postId);
    await updateDoc(speciesIdentificationRef,{
        moderatorchosen: false,
    });

    await autoUpdateSpecies(postId);
}

async function setStatus(postId, status){
    const speciesIdentificationRef = doc(db, "species_identification", postId);
    await updateDoc(speciesIdentificationRef,{
        status: status,
    });
}

async function getSpeciesIdentificationPostMetaData(postId){
    const speciesIdentificationRef = doc(db, "species_identification", postId);
    const docSnap = await getDoc(speciesIdentificationRef);
    return new SpeciesIdentificationPostMetaData(docSnap.data().pinnedspeciesidentification, docSnap.data().status, docSnap.data().moderatorchosen, docSnap.data().originalspecies);
}

export{isUserModerator, pinSpeciesIdentification, unpinSpeciesIdentification, setStatus, getSpeciesIdentificationPostMetaData}
