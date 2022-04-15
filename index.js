import * as Y from 'yjs'
import { WebsocketProvider } from 'y-websocket'

class NoteManager {
    notemap = {}; // map note id to notes
    
    textFont = null; // for displaying text in 3d
    
    notecounts = {
        'urgent': 0,
        'todo': 0,
        'nice-to-have': 0
    };
    
    colors = {
        'urgent': 0xff0000,
        'todo': 0x00dd55,
        'nice-to-have': 0x0011ff
    };
    
    ydoc = new Y.Doc();
    wsProvider = null;
    theData = null;
    
    // generate the object that'll hold 2d note data
    // that gets passed to the other clients
    generate2dNoteYdoc(noteElement, noteText, noteType){
        // to think about: not all clients will have the same screens
        // so will using the same left and top for everyone be problematic?
        return {
            left: noteElement.style.left || "0px",
            top: noteElement.style.top || "0px",
            transform: noteElement.style.transform,
            type: noteType,
            text: noteText,
            id: noteElement.id,
        };
    }
    
    addToYdoc(noteId, data){
        this.theData.set(noteId, data);
    }
    
    removeFromYdoc(noteId){
        this.theData.delete(noteId);
    }
    
    init(){
        // set up watching for changes to the data
        this.theData = this.ydoc.getMap("theData");
        this.theData.observe(event => {
            // https://docs.yjs.dev/api/shared-types/y.map#observing-changes-y.mapevent
            // update this.notemap (or just use Ydoc map the whole time?)
            event.changes.keys.forEach((change, key) => {
                if(change.action === 'add'){
                    //console.log(key + " was added");
                    if(this.notemap[key] === undefined){
                        // for all connected clients other than the one who just added a new note,
                        // add the new note
                        
                        // get the 2d info needed to create a new one
                        const data2d = JSON.parse(this.theData.get(key));
                        
                        // create the new 2d and 3d note
                        console.log("setting up " + key);
                        console.log(data2d);
                        setUpNote(data2d.type, data2d);
                    }   
                }else if(change.action === 'update'){
                    //console.log(key + " was updated");
                    
                    // get the 2d info needed to create a new one
                    const data2d = JSON.parse(this.theData.get(key));
                    this._update2dNote(data2d);
                    
                    // TODO: update the 3d note
                    
                }else if(change.action === 'delete'){
                    console.log(key + " was deleted");
                    
                    // TODO: how to avoid coming here if this client was
                    // the one who deleted?
                    // just do the remove stuff here and have removeNote
                    // only call removeFromYdoc()
                }
            });
        });
        
        try {
            // set up WebsocketProvider server so clients can share info with each other
            this.wsProvider = new WebsocketProvider('ws://localhost:1234', 'pinboard', this.ydoc);
        }catch(error){
            console.log("can't connect to y-websocket server.");
        }
        
        console.log("ydoc set up");
    }
    
    _update2dNote(data2d){
        const note2d = this.notemap[data2d.id].note2d;
        note2d.style.transform = data2d.transform;
        note2d.style.left = data2d.left;
        note2d.style.top = data2d.top;
        
        // TODO: update text in textarea as well
    }
    
    _create3dNote(color){
        // create a group consisting of a plane for the note
        // and a thumbtack
        const group = new THREE.Group();
        
        const geometry = new THREE.PlaneGeometry(2.4, 2.4);
        const material = new THREE.MeshBasicMaterial({color});
        const newNote = new THREE.Mesh(geometry, material);
        
        group.add(newNote);
        
        const newThumbtack = thumbtackModel.clone();
        newThumbtack.scale.x *= 0.4;
        newThumbtack.scale.y *= 0.2;
        newThumbtack.scale.z *= 0.4;
        newThumbtack.rotateX(-Math.PI/2);
        newThumbtack.translateY(0.3);
        //newThumbtack.translateZ(-0.1);
        group.add(newThumbtack);
        
        return group;
    }
    
    add3dNote(type, noteElement, ydocNoteInfo=null){
        // assign new id to note and store in map
        // so we can track the 2d and 3d versions of it
        const newId = type + this.notecounts[type]++;
        noteElement.id = newId;
        
        const note3d = this._create3dNote(this.colors[type]);
        
        mouse.x = -1;
        mouse.y = 1;
        raycaster.setFromCamera(mouse, camera);
        const dist = note3d.position.distanceTo(camera.position);
        raycaster.ray.at(dist, note3d.position); // set note3d position
        
        this.notemap[newId] = {
            'note2d': noteElement,
            'note3d': note3d
        }
        
        scene.add(note3d);
        
        // add note data to Ydoc
        if(ydocNoteInfo === null){
            const data2d = this.generate2dNoteYdoc(noteElement, "", type);
            this.addToYdoc(newId, JSON.stringify(data2d));
        }
    }
    
    get3dNote(id){
        return this.notemap[id]['note3d'];
    }
    
    removeNote(id){
        const note = this.notemap[id];
        if(note){
            const note2d = note.note2d;
            note2d.parentNode.removeChild(note2d);
            scene.remove(note.note3d);
            delete this.notemap[id];
            
            // remove note from Ydoc
            this.removeFromYdoc(id);
        }
    }
    
    // rotation - in radians
    rotateNote3d(rotation, noteId){
        const note3d = this.get3dNote(noteId);
        note3d.setRotationFromAxisAngle(new THREE.Vector3(0, 0, 1), rotation);
    }
    
    updateNote3dText(text, noteId){
        const note3d = this.get3dNote(noteId);
        if(note3d.noteText && note3d.noteText === text){
            return;
        }else{
            note3d.noteText = text.split(" ").slice(0, 3).concat(["..."]).join(" "); // take first 3 words
            
            // clear old text mesh if exists
            if(note3d.text3d) note3d.remove(note3d.text3d);
            
            const geometry = new THREE.TextGeometry(note3d.noteText, {
                size: 0.2,
                height: 0.05,
                curveSegments: 6,
                font: noteManager.textFont,
            });
            
            const color = new THREE.Color();
            color.setRGB(130, 130, 130);
            
            const material = new THREE.MeshBasicMaterial({color});
            const currNoteText = new THREE.Mesh(geometry, material);
            currNoteText.translateX(-1.1);
            currNoteText.translateY(0.4);
            
            note3d.text3d = currNoteText;
            note3d.add(currNoteText);
        }
    }
    
    moveNote3d(newX, newY, boardWidth, boardHeight, note3d){
        // move 3d note based on 2d note position
        mouse.x = (newX / boardWidth) * 2 - 1; //(evt.offsetX / evt.target.width) * 2 - 1;
        mouse.y = -(newY / boardHeight) * 2 + 1; //-(evt.offsetY / evt.target.height) * 2 + 1;
        raycaster.setFromCamera(mouse, camera);
        
        const zPos = note3d.position.z;
        
        // get the position that's dist along the new ray and set note3d's position to that
        const dist = note3d.position.distanceTo(camera.position);
        raycaster.ray.at(dist, note3d.position);
    }
    
    updateNotes(notes){
        console.log(notes);
    }
};
const noteManager = new NoteManager();

// for the 3d board
const loader = new THREE.GLTFLoader();
const fontLoader = new THREE.FontLoader();
const renderer = new THREE.WebGLRenderer({antialias: true});
const w = document.getElementById("board").clientWidth;
const h = document.getElementById("board").clientHeight;
const camera = new THREE.PerspectiveCamera(60, w / h, 0.01, 1000);
const scene = new THREE.Scene();
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

let thumbtackModel = null;
function getModel(modelFilePath){
    return new Promise((resolve, reject) => {
        loader.load(
            modelFilePath,
            function(gltf){          
                gltf.scene.traverse((child) => {
                    if(child.type === "Mesh"){
                        resolve(child);
                    }
                });
            },
            // called while loading is progressing
            function(xhr){
                console.log((xhr.loaded / xhr.total * 100) + '% loaded');
            },
            // called when loading has errors
            function(error){
                console.log('An error happened');
                console.log(error);
            }
        );
    });
}

function animate(){
    requestAnimationFrame(animate);
    renderer.render(scene, camera);
}


function setup3dBoard(){
    const container = document.getElementById("board3d");

    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.setSize(w, h);
    container.appendChild(renderer.domElement);

    camera.position.set(0, 4, 8);

    scene.background = new THREE.Color(0xcccccc);
    scene.add(camera);

    const pointLight = new THREE.PointLight(0xffffff, 1, 0);
    pointLight.position.set(0, 4, -2);
    pointLight.castShadow = true;
    scene.add(pointLight);

    const hemiLight = new THREE.HemisphereLight(0xffffff);
    hemiLight.position.set(0, 4, -2);
    scene.add(hemiLight);
    
    // add corkboard mesh
    const bgGeometry = new THREE.PlaneGeometry(20, 20);
    const bgTexture = new THREE.TextureLoader().load("cork-board.jpg");
    const bgMaterial = new THREE.MeshBasicMaterial({map: bgTexture});
    const bg = new THREE.Mesh(bgGeometry, bgMaterial);
    scene.add(bg);
    bg.translateZ(-1);
    
    animate();
}

getModel('thumbtack.gltf').then((model) => {
    thumbtackModel = model;
    fontLoader.load("helvetiker_regular.typeface.json", (tex) => {
        noteManager.textFont = tex;
        setup3dBoard();
        
        // allow new notes to be added since we have all our resources now
        Array.from(document.querySelectorAll(".noteType")).forEach((btn) => {
            btn.disabled = false;
        });
        
        // set up Yjs stuff
        noteManager.init();
    });
});


// https://stackoverflow.com/questions/5570390/resize-event-for-textarea
// https://stackoverflow.com/questions/21714778/antialiased-text-in-firefox-after-css-rotation
// ydocNoteInfo will be an object containing info about a 2d note that can be used
// when constructing a new note (see return value for generate2dNoteYdoc())
// should this just be a method in NoteManager??
function setUpNote(noteType, ydocNoteInfo=null){
    // color code notes based on type
    // show add button, cancel button
    // allow user to move note around on target area
    const board = document.querySelector(".board");
    const boardStyle = window.getComputedStyle(board, null);

    const note = document.createElement('div')
    note.style.position = "absolute";
    note.style.width = "200px";
    note.style.height = "200px";
    note.style.backgroundColor = "#ffffff";
    note.style.transform = "rotate(0deg)";
    note.style.textAlign = "center";
    
    const pin = document.createElement('div');
    pin.style.height = "20px";
    pin.style.width = "20px";
    pin.style.border = "1px solid #000000";
    pin.style.borderRadius = "30px";
    pin.style.backgroundColor = "#ff0000";
    pin.style.margin = "2% auto";
    pin.style.transition = "transform 0.5s";
    note.appendChild(pin);
    
    const noteTextArea = document.createElement('textarea');
    noteTextArea.style.marginTop = "5%";
    noteTextArea.style.height = "50%";
    note.appendChild(noteTextArea);
    noteTextArea.addEventListener('input', (evt) => {
        // TODO: pass noteManager as arg to setUpNote()?
        noteManager.updateNote3dText(evt.target.value, note.id);
        
        // update Ydoc
        const data2d = noteManager.generate2dNoteYdoc(note, evt.target.value, noteType);
        console.log("sending: " + JSON.stringify(data2d));
        noteManager.addToYdoc(note.id, JSON.stringify(data2d));
    });
    
    const completeButton = document.createElement('button');
    completeButton.textContent = "completed?";
    note.appendChild(completeButton);
    completeButton.addEventListener('click', (evt) => {
        evt.preventDefault();
        
        const completedNoteContent = noteTextArea.value;
        if(completedNoteContent.trim() !== ""){
            const pre = document.createElement('pre');
            pre.textContent = completedNoteContent;
            pre.style.backgroundColor = "#ccc";
            pre.style.margin = "0 auto";
            pre.style.width = "50%";
            
            const header = document.createElement("p");
            header.textContent = noteType + ":";
            const container = document.querySelector(".completed");
            container.appendChild(header);
            container.appendChild(pre);
            container.appendChild(document.createElement('br'));
            container.appendChild(document.createElement('br'));
        }
        
        noteManager.removeNote(note.id); // TODO: need to differentiate between deleted vs completed notes
    });
    
    const deleteButton = document.createElement('button');
    deleteButton.textContent = "delete";
    deleteButton.style.color = "#ff2200";
    deleteButton.addEventListener('click', (evt) => {
        if(confirm("are you sure you want to delete this note?")){
            noteManager.removeNote(note.id);
        }
    });
    note.appendChild(deleteButton);
    
    if(noteType === "urgent"){
        note.style.border = "2px solid #ff0000";
    }else if(noteType === "todo"){
        note.style.border = "2px solid #00dd55";
    }else{
        note.style.border = "2px solid #0011ff";
    }
    
    // be able to rotate the note
    note.addEventListener('wheel', (evt) => {
        if(document.activeElement === noteTextArea) return;
        const currRotation =  parseInt(note.style.transform.match(/-?[0-9]+/)[0]) % 360;
        let newRotation = currRotation;
        if(evt.deltaY > 0){
            // rotate left
            newRotation--;
        }else{
            newRotation++;
        }
        note.style.transform = `rotate(${newRotation}deg)`;
        noteManager.rotateNote3d(-newRotation*Math.PI/180, note.id);
    });
    
    //  use draggable? https://stackoverflow.com/questions/57435575/how-to-make-a-draggable-element-stay-at-the-new-position-when-dropped-html5-not
    note.addEventListener('mousedown', (evt) => {
        const offsetX = evt.clientX - note.offsetLeft + window.pageXOffset;
        const offsetY = evt.clientY - note.offsetTop + window.pageYOffset;
        
        function move(evt){
            // take pin off of note
            pin.style.transform = "translate(calc(-100vw))";
            
            // restrict movement to only within the board
            const newX = evt.clientX - offsetX;
            const newY = evt.clientY - offsetY;
            const boardWidth = parseInt(boardStyle.width);
            const boardHeight = parseInt(boardStyle.height);
            
            if(newX > 10 && newX <= parseInt(boardStyle.left) + boardWidth - parseInt(evt.target.style.width) &&
               newY > 10 && newY <= parseInt(boardStyle.top) + boardHeight - parseInt(evt.target.style.height)){
                // evt here is based on document, not note
                const newX = evt.clientX - offsetX;
                const newY = evt.clientY - offsetY;
                
                note.style.left = newX + "px";
                note.style.top = newY + "px";
                
                // TODO: figure out the extra addition stuff for offset. I think it has to do with the 3d placement
                // being based off the center of the square, whereas in 2d we're using the top left corner of the square.
                noteManager.moveNote3d(newX+120, newY+120, boardWidth, boardHeight, noteManager.get3dNote(note.id));
                
                // update ydoc
                const data2d = noteManager.generate2dNoteYdoc(note, noteTextArea.value, noteType);
                console.log("sending: " + JSON.stringify(data2d));
                noteManager.addToYdoc(note.id, JSON.stringify(data2d));
            }
        }
        
        document.addEventListener('mousemove', move);
        
        document.addEventListener('mouseup', (evt) => {
            document.removeEventListener('mousemove', move);
            
            // put pin back
            pin.style.transform = "";
            //pin.style.visibility = "";
        });
    });
    
    if(ydocNoteInfo){
        note.style.left = ydocNoteInfo.left;
        note.style.top = ydocNoteInfo.top;
        note.style.transform = ydocNoteInfo.transform;
        //note.id = ydocNoteInfo.id;
    }
    
    board.appendChild(note);
    
    noteManager.add3dNote(noteType, note, ydocNoteInfo);
}

function findNotes(evt){
    // search all child nodes that are notes of the board element
    const query = document.querySelector(".search").value;
    //console.log(substring);
    
    let boardNodes = Array.from(document.querySelector(".board").children);
    boardNodes = boardNodes.map((noteDiv) => noteDiv.querySelector("textarea"));
    
    for(let note of boardNodes){
        // case-insensitive
        if(note.value.toLowerCase().includes(query.toLowerCase())){
            const currNoteBorderColor = note.parentNode.style.border;
            note.parentNode.style.border = "1px solid #ffff00"; // yellow highlight
            setTimeout(() => {
                note.parentNode.style.border = currNoteBorderColor;
                //note.style.border = "";
            }, 2000);
        }
    }
}

function selectNote(evt){
    const noteType = evt.target.textContent.trim();
    //alert(`adding a ${noteType}-type note!`);
    setUpNote(noteType);
}

// attach selectNote onclick event listener to each note type button
Array.from(document.querySelectorAll(".noteType")).forEach((noteType) => {
    noteType.addEventListener("click", selectNote);
});


let currMode = "2d";
async function flipMode(evt){
    const rotateBoard = [
        {transform: 'rotateY(180deg)'}
    ];

    const rotateTiming = {
        duration: 500,
        iterations: 1
    };

    if(currMode === "2d"){
        evt.target.textContent = "to " + currMode;
        await document.getElementById("board").animate(rotateBoard, rotateTiming).finished;
        document.getElementById("board").style.display = "none";
        document.getElementById("board3d").style.display = "block";
        currMode = "3d";
    }else{
        evt.target.textContent = "to " + currMode;
        await document.getElementById("board3d").animate(rotateBoard, rotateTiming).finished;
        document.getElementById("board3d").style.display = "none";
        document.getElementById("board").style.display = "block";
        currMode = "2d";
    }
}
document.querySelector(".flipMode").addEventListener('click', flipMode);