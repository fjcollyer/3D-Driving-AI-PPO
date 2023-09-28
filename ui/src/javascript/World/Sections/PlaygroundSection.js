const fjcConfig = require('../../fjcConfig.js');

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

import racetrackModel from '../../../models/racetrack/racetrackViz.glb';

/*
Actions from physics.controls.actions
        this.actions.up = false
        this.actions.right = false
        this.actions.down = false
        this.actions.left = false
        this.actions.brake = false
        this.actions.boost = false
*/

/*
Return format for AI decision (python API)
        action = {
            "up": binary_action[0],
            "right": binary_action[1],
            "down": binary_action[2],
            "left": binary_action[3],
            "brake": binary_action[4],
            "boost": binary_action[5]
        }
*/

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

        // Set up HTML elements
        this.setupHTML();
        this.tickCount = 0;

        // AI config
        this.aiModeActive = true;
        this.callFrequency = 60 / 4 // Example: setting this to 60 will call the AI once per second
        // AI Reward values
        this.rewardDeath = -1;
        this.rewardCheckpoint = 1;
        this.rewardWin = 1;
        this.rewardStale = -0.2;
        this.rewardDefault = 0.2;
        // AI state variables
        this.previousState = null;
        this.previousAiDecision = null;

        // Game logic setup
        this.resetGame();

        // UI setup
        this.container = new THREE.Object3D();
        this.container.matrixAutoUpdate = false;
        this.setupLighting();
        this.loadRacetrack();
        this.addCheckpointsUi();
        this.addStartAndFinishLine();

        // Main tick function / Event loop
        this.setTickFunction();
    }  

    resetGame() {
        // Reset the game logic variables
        this.gameInProgress = false;
        this.numCheckpointsPassed = 0;
        this.gameStartTime = null;

        // Set the default values for the timer and checkpoint count
        document.getElementById("checkpoint-count").innerText = `Checkpoints: 0/${fjcConfig.numberOfCheckpoints}`;
        document.getElementById("lap-timer").innerText = `Time: 00:00`;

        // Reset the car position
        this.physics.car.recreate(fjcConfig.carStartingPosition[0], fjcConfig.carStartingPosition[1], fjcConfig.carStartingPosition[2]);
    }

    resetAi() {
        this.previousState = {};
        this.previousAiDecision = {};
    }

    getState() {
        let state = {};

        // Position of the car
        state.carPositionX = this.physics.car.chassis.body.position.x;
        state.carPositionY = this.physics.car.chassis.body.position.y;
        state.carPositionZ = this.physics.car.chassis.body.position.z;

        // Direction of the cars movement
        state.carDirectionTheta = this.physics.car.directionTheta
        state.carDirectionPhi = this.physics.car.directionPhi

        // Speed of the car
        state.carSpeed = this.physics.car.speed;

        // Time taken so far
        state.currentTimeTaken = Date.now() - this.gameStartTime;

        // Number of checkpoints passed
        state.numCheckpointsPassed = this.numCheckpointsPassed;

        return state;
    }

    /*
    *  1. Send data to the AI
    *  2. Receive the AI's decision
    *  3. Make the decision
    *  4. Update the state variables
    */
    makeAiDecision(previousState, currentState, previousAiDecision, reward, game_over) {
        if (!previousState && !previousAiDecision) {
            // This is the first decision, so just send the current state
            this.previousState = currentState;
            this.previousAiDecision = {
                up: false,
                right: false,
                down: false,
                left: false,
                brake: false,
                boost: false
            };
            return;
        }

        const dataToSend = {
            currentState: Object.values(currentState),
            previousState: Object.values(previousState),
            previousAiDecision: Object.values(previousAiDecision),
            reward: reward,
            gameOver: game_over
        };
        // Verify the data is correct, each array should have the correct amount of elements
        if (dataToSend.currentState.length != 8) {
            console.error("Error in makeAiDecision: currentState array has incorrect number of elements. Data sent: ", dataToSend);
            return;
        }
        if (dataToSend.previousState.length != 8) {
            console.error("Error in makeAiDecision: previousState array has incorrect number of elements. Data sent: ", dataToSend);
            return;
        }
        if (dataToSend.previousAiDecision.length != 6) {
            console.error("Error in makeAiDecision: previousAiDecision array has incorrect number of elements. Data sent: ", dataToSend);
            return;
        }
        if (reward < -1 || reward > 1) {
            console.error("Error in makeAiDecision: reward is not between -1 and 1. Data sent: ", dataToSend);
            return;
        }
        if (typeof game_over != "boolean") {
            console.error("Error in makeAiDecision: game_over is not a boolean. Data sent: ", dataToSend);
            return;
        }


        console.log("Reward: ", reward);
        fetch('http://localhost:5001/get_action', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(dataToSend)
        })
        .then(response => response.json())
        .then(data => {
            // Make the decision
            this.physics.controls.actions.up = data.up;
            this.physics.controls.actions.right = data.right;
            this.physics.controls.actions.down = data.down;
            this.physics.controls.actions.left = data.left;
            this.physics.controls.actions.brake = data.brake;
            this.physics.controls.actions.boost = data.boost;
            //console.log("Up: ", data.up, " Right: ", data.right, " Down: ", data.down, " Left: ", data.left, " Brake: ", data.brake, " Boost: ", data.boost);

            // Update the state variables
            this.previousState = currentState;
            this.previousAiDecision = data;
        })
        .catch((error) => {
            console.error('Error in makeAiDecision:', error);
            console.log("Data sent to AI: ", dataToSend);
        });
    }


    aiTick() {
        const currentState = this.getState();

        // Handle first tick
        if (!this.previousState && !this.previousAiDecision) {
            console.log("First tick in aiTick");
            this.previousState = currentState;
            this.previousAiDecision = {
                up: false,
                right: false,
                down: false,
                left: false,
                brake: false,
                boost: false
            };
        }

        // Check for win
        if (this.numCheckpointsPassed >= fjcConfig.numberOfCheckpoints) {
            if (carPositionX >= startAndFinishLine.x[0] && carPositionX <= startAndFinishLine.x[1] &&
                carPositionY >= startAndFinishLine.y[0] && carPositionY <= startAndFinishLine.y[1] &&
                carPositionZ >= startAndFinishLine.z[0] && carPositionZ <= startAndFinishLine.z[1]) {
                    this.makeAiDecision(this.previousState, currentState, this.previousAiDecision, this.rewardWin, true);
                    this.resetGame();
                    this.resetAi();
                    return;
            }
        }

        // Check for death
        if (currentState.carPositionZ <= fjcConfig.deathPositionZ) {
            this.makeAiDecision(this.previousState, currentState, this.previousAiDecision, this.rewardDeath, true);
            this.resetGame();
            this.resetAi();
            return;
        }

        // Check for checkpoint passed
        const nextCheckpoint = fjcConfig.checkpoints[this.numCheckpointsPassed];
        if (currentState.carPositionX >= nextCheckpoint.x[0] && currentState.carPositionX <= nextCheckpoint.x[1] &&
            currentState.carPositionY >= nextCheckpoint.y[0] && currentState.carPositionY <= nextCheckpoint.y[1] &&
            currentState.carPositionZ >= nextCheckpoint.z[0] && currentState.carPositionZ <= nextCheckpoint.z[1]) {
                
                this.numCheckpointsPassed += 1;
                return;
        }

        // When game is in progress, call the AI every callFrequency ticks
        if (this.tickCount % this.callFrequency === 0 && this.tickCount > 0) {
            if (this.numCheckpointsPassed  > this.previousState.numCheckpointsPassed) {
                this.makeAiDecision(this.previousState, currentState, this.previousAiDecision, this.rewardCheckpoint, false);
                // If the car has barley moved, give a negative reward
            } else if (Math.abs(currentState.carPositionX - this.previousState.carPositionX) < 0.1 &&
                    Math.abs(currentState.carPositionY - this.previousState.carPositionY) < 0.1 &&
                    Math.abs(currentState.carPositionZ - this.previousState.carPositionZ) < 0.1) {
                        this.makeAiDecision(this.previousState, currentState, this.previousAiDecision, this.rewardStale, false);
            } else {
                // If the car has not passed a checkpoint and has moved, give a default reward
                this.makeAiDecision(this.previousState, currentState, this.previousAiDecision, this.rewardDefault, false);
            }
            this.tickCount = 0;
        }
    }

    setTickFunction() {
        this.time.on('tick', () => {

            // Increment the tick count
            this.tickCount += 1;

            // Automatically move forwards untill the game starts
            if (!this.gameInProgress) {
                this.physics.controls.actions.up = true;

                this.physics.controls.actions.down = false;
                this.physics.controls.actions.left = false;
                this.physics.controls.actions.right = false;
                this.physics.controls.actions.brake = false;
                this.physics.controls.actions.boost = false;

                // Check if the car has passed the start line
                const carPositionX = this.physics.car.chassis.body.position.x;
                const carPositionY = this.physics.car.chassis.body.position.y;
                const carPositionZ = this.physics.car.chassis.body.position.z;
                if (carPositionX >= fjcConfig.startAndFinnishLine.x[0] && carPositionX <= fjcConfig.startAndFinnishLine.x[1] &&
                    carPositionY >= fjcConfig.startAndFinnishLine.y[0] && carPositionY <= fjcConfig.startAndFinnishLine.y[1] &&
                    carPositionZ >= fjcConfig.startAndFinnishLine.z[0] && carPositionZ <= fjcConfig.startAndFinnishLine.z[1]) {
                        this.gameInProgress = true;
                        this.gameStartTime = Date.now();
                }
            }

            // AI logic
            if (this.aiModeActive && this.gameInProgress) {
                this.aiTick();
            }

            // Player logic
            if (!this.aiModeActive && this.gameInProgress) {
                print("Player logic not implemented yet");
            }

            // Update HTML elements
            if (this.gameInProgress) {
                document.getElementById("checkpoint-count").innerText = `Checkpoints: ${this.numCheckpointsPassed}/${fjcConfig.numberOfCheckpoints}`;
                let elapsedTime = Date.now() - this.gameStartTime;
                let seconds = Math.floor((elapsedTime / 1000) % 60);
                let minutes = Math.floor((elapsedTime / (1000 * 60)) % 60);
                document.getElementById("lap-timer").innerText = `Time: ${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
            }
        });
    }    




    /*
    *  UI Setup functions
    */

    setupHTML() {
        document.querySelector('.fjc-threejs-journey').removeAttribute('hidden');
        document.querySelector('.threejs-journey.js-threejs-journey').removeAttribute('hidden');

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

    addCheckpointsUi() {
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