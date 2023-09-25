const fjcConfig = require('../../fjcConfig.js');

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

import racetrackModel from '../../../models/racetrack/racetrackViz.glb';

export default class PlaygroundSection {
    constructor(_options) {
        // Options
        this.time = _options.time;
        this.physics = _options.physics;
        this.resources = _options.resources;
        this.objects = _options.objects;
        this.areas = _options.areas;
        this.tiles = _options.tiles;
        this.debug = _options.debug;
        this.x = _options.x;
        this.y = _options.y;

        // Game logic setup
        this.gameStarted = false;
        this.numCheckpointsPassed = 0;
        this.gameStartTime = null;

        // Set up HTML elements
        this.setupHTML();

        // Set up of all objects
        this.container = new THREE.Object3D();
        this.container.matrixAutoUpdate = false;
        this.setupLighting();
        this.loadRacetrack();
        //this.addCheckpoints();
        this.addStartAndFinishLine();
        this.setTickFunction();
    }  

    setupHTML() {
        document.querySelector('.fjc-threejs-journey').removeAttribute('hidden');
        document.querySelector('.threejs-journey.js-threejs-journey').removeAttribute('hidden');

        // Set the default values for the timer and checkpoint count
        document.getElementById("checkpoint-count").innerText = `Checkpoints: 0/${fjcConfig.numberOfCheckpoints}`;
        document.getElementById("lap-timer").innerText = `Time: 00:00`;

    }

    setTickFunction() {
        this.time.on('tick', () => {
            // Update HTML elements
            if (this.gameStarted) {
                document.getElementById("checkpoint-count").innerText = `Checkpoints: ${this.numCheckpointsPassed}/${fjcConfig.numberOfCheckpoints}`;
                let elapsedTime = Date.now() - this.gameStartTime;
                let seconds = Math.floor((elapsedTime / 1000) % 60);
                let minutes = Math.floor((elapsedTime / (1000 * 60)) % 60);
                document.getElementById("lap-timer").innerText = `Time: ${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
            }

            let carPositionX = this.areas.car.position.x;
            let carPositionY = this.areas.car.position.y;
            let carPositionZ = this.areas.car.position.z;

            // Check death position condition
            if (carPositionZ <= fjcConfig.deathPositionZ) {
                console.log("Game Over! You fell off the track!");
                this.gameStarted = false;
                this.numCheckpointsPassed = 0;
                this.gameStartTime = null;

                this.setupHTML();
                this.physics.car.recreate(fjcConfig.carStartingPosition[0], fjcConfig.carStartingPosition[1], fjcConfig.carStartingPosition[2]);
            }

    
            if (!this.gameStarted) {
                // In most efficient way possible check if we are inside the startAndFinishLine
                const startAndFinishLine = fjcConfig.startAndFinnishLine;
                if (carPositionX >= startAndFinishLine.x[0] && carPositionX <= startAndFinishLine.x[1] &&
                    carPositionY >= startAndFinishLine.y[0] && carPositionY <= startAndFinishLine.y[1] &&
                    carPositionZ >= startAndFinishLine.z[0] && carPositionZ <= startAndFinishLine.z[1]) {
                    this.gameStarted = true;
                    this.numCheckpointsPassed = 0;
                    console.log("Game Started!");
                    this.gameStartTime = Date.now();
                }
            }

            if (this.gameStarted) {
                // In most efficient way possible check if we are inside the next checkpoint
                const nextCheckpoint = fjcConfig.checkpoints[this.numCheckpointsPassed];

                if (carPositionX >= nextCheckpoint.x[0] && carPositionX <= nextCheckpoint.x[1] &&
                    carPositionY >= nextCheckpoint.y[0] && carPositionY <= nextCheckpoint.y[1] &&
                    carPositionZ >= nextCheckpoint.z[0] && carPositionZ <= nextCheckpoint.z[1]) {
                    this.numCheckpointsPassed += 1;
                    console.log("Passed Checkpoint: ", this.numCheckpointsPassed);
                }
    
                // If all checkpoints have been passed, the game finishes
                if (this.numCheckpointsPassed >= fjcConfig.numberOfCheckpoints) {
                    this.gameStarted = false;
                    console.log("Game Finished!");
                }
            }
        });
    }    

    addStartAndFinishLine() {
        const startAndFinnishLine = fjcConfig.startAndFinnishLine;
        
        // Calculate the midpoint and dimensions of the plane
        const xMid = (startAndFinnishLine.x[0] + startAndFinnishLine.x[1]) / 2;
        const yMid = (startAndFinnishLine.y[0] + startAndFinnishLine.y[1]) / 2;
        const zMid = (startAndFinnishLine.z[0] + startAndFinnishLine.z[1]) / 2;
    
        const width = startAndFinnishLine.x[1] - startAndFinnishLine.x[0];
        const height = startAndFinnishLine.y[1] - startAndFinnishLine.y[0];
        const depth = startAndFinnishLine.z[1] - startAndFinnishLine.z[0];
        
        // Create a box geometry
        const geometry = new THREE.BoxGeometry(width, height, depth);

        // Create a basic material
        const material = new THREE.MeshBasicMaterial({color: 0x00ff00, wireframe: true});

        // Create a mesh with the geometry and material
        const mesh = new THREE.Mesh(geometry, material);
        
        // Set the position of the mesh to the midpoint of the startAndFinishLine
        mesh.position.set(xMid, yMid, zMid);
        
        // Add the mesh to the container
        this.container.add(mesh);
    }    

addCheckpoints() {
    // Get checkpoints from fjcConfig
    const checkpoints = fjcConfig.checkpoints;

    // Loop over each checkpoint
    Object.keys(checkpoints).forEach(key => {
        const checkpoint = checkpoints[key];

        const xMid = (checkpoint.x[0] + checkpoint.x[1]) / 2;
        const yMid = (checkpoint.y[0] + checkpoint.y[1]) / 2;
        const zMid = (checkpoint.z[0] + checkpoint.z[1]) / 2;

        const width = checkpoint.x[1] - checkpoint.x[0];
        const height = checkpoint.y[1] - checkpoint.y[0];
        const depth = checkpoint.z[1] - checkpoint.z[0];

        // Create a box geometry
        const geometry = new THREE.BoxGeometry(width, height, depth);

        // Create a basic material
        const material = new THREE.MeshBasicMaterial({color: 0x00ff00, wireframe: true});

        // Create a mesh with the geometry and material
        const mesh = new THREE.Mesh(geometry, material);

        // Set the position of the mesh to the midpoint of the checkpoint
        mesh.position.set(xMid, yMid, zMid);

        // Add the mesh to the container
        this.container.add(mesh);
    });
}   

    setupLighting() {
        const ambientLight = new THREE.AmbientLight(0xffffff, 5); // white color, very high intensity
        this.container.add(ambientLight);
    
        // You can keep or remove the spotlight code based on your preference
    }
    
    loadRacetrack() {
        const loader = new GLTFLoader();

        loader.load(racetrackModel, (gltf) => {
            const model = gltf.scene;
            this.container.add(model);
        });

        this.objects.add({
            base: this.resources.items.racetrackEmpty.scene, // Empty glb file (has one tiny mesh in it)
            collision: this.resources.items.racetrack.scene, // This is the mesh that will be used for collision
            floorShadowTexture: null,
            offset: new THREE.Vector3(this.x, this.y, 0),
            mass: 0 // Static object
        });
    }
}