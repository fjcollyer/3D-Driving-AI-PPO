const fjcConfig = require('../../fjcConfig.js');

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

import racetrackVizModel from '../../../models/racetrack/racetrackViz.glb';
import racetrackRaysModel from '../../../models/racetrack/racetrackRays.glb';

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
        this.toleranceDistanceRays = 0.4;
        this.stateSpace = 8;
        this.actionSpace = 4;
        // AI Reward values
        this.rewardDeath = -10;
        this.rewardWin = 10;
        this.rewardStagnaion = -1;
        this.relativeRewardMax = 1;
        // AI state variables
        this.previousState = null;
        this.previousAiDecision = null;

        this.racetrackRaysModel = null;

        // Game logic setup
        this.resetGame();

        // UI setup
        this.container = new THREE.Object3D();
        this.container.matrixAutoUpdate = false;
        this.setupLighting();
        this.loadRacetrack();
        //this.addLinePathFromPoints();

        // Main tick function / Event loop
        this.setTickFunction();
    }

    resetGame() {
        // Reset the game logic variables
        this.gameInProgress = false;
        this.gameStartTime = null;

        this.segmentIndex = 0;
        if (this.line) {
            // Remove the existing line from the container
            this.container.remove(this.line);
        }
        this.line = null;

        this.percentOfTrackCompleted = 0;
        this.closestPoint = null;
        this.closestPointDistance = null;
        this.raysLines = null;
        this.raysLinesLengths = null;

        this.carPositionX = null;
        this.carPositionY = null;
        this.carPositionZ = null;

        // Set the default values for the timer and progress bar
        document.getElementById("checkpoint-count").innerText = `Progress: 0%`;
        document.getElementById("lap-timer").innerText = `Time: 00:00`;

        // Reset the car position
        this.physics.car.recreate(fjcConfig.carStartingPosition[0], fjcConfig.carStartingPosition[1], fjcConfig.carStartingPosition[2]);
    }

    resetAi() {
        this.previousState = this.getState();
        this.previousAiDecision = {
            up: false,
            right: false,
            //down: false,
            left: false,
            //brake: false,
            boost: false
        };
    }

    getState() {
        let state = {};

        // Percent of the track completed
        state.percentOfTrackCompleted = this.percentOfTrackCompleted;

        // Speed of the car
        state.carSpeed = this.physics.car.speed;

        // Angle of the car in x-y plane (direction car is pointing)
        state.carAngle = this.physics.car.angle;

        // Ray lengths
        state.rayLengthLeft = this.rayLinesLengths.left;
        state.rayLengthRight = this.rayLinesLengths.right;
        state.rayLengthForward = this.rayLinesLengths.forward;
        state.rayLengthForwardLeft = this.rayLinesLengths.forwardLeft;
        state.rayLengthForwardRight = this.rayLinesLengths.forwardRight;

        // Direction of the cars movement - not needed/used
        // state.carDirectionTheta = this.physics.car.directionTheta
        // state.carDirectionPhi = this.physics.car.directionPhi

        // Position of the car - not needed/used
        // state.carPositionX = this.physics.car.chassis.body.position.x;
        // state.carPositionY = this.physics.car.chassis.body.position.y;
        // state.carPositionZ = this.physics.car.chassis.body.position.z;

        // Distance to the closest point on the track
        // state.closestPointDistance = this.closestPointDistance;

        return state;
    }

    /*
    *  1. Send data to the AI
    *  2. Receive the AI's decision
    *  3. Make the decision
    *  4. Update the state variables
    */
    makeAiDecision(previousState, currentState, previousAiDecision, reward, game_over) {
        const dataToSend = {
            currentState: Object.values(currentState),
            previousState: Object.values(previousState),
            previousAiDecision: Object.values(previousAiDecision),
            reward: reward,
            gameOver: game_over
        };
        // Verify the data is correct, each array should have the correct amount of elements
        if (dataToSend.currentState.length != this.stateSpace) {
            console.error("Error in makeAiDecision: currentState array has incorrect number of elements. Data sent: ", dataToSend);
            return;
        }
        if (dataToSend.previousState.length != this.stateSpace) {
            console.error("Error in makeAiDecision: previousState array has incorrect number of elements. Data sent: ", dataToSend);
            return;
        }
        if (dataToSend.previousAiDecision.length != this.actionSpace) {
            console.error("Error in makeAiDecision: previousAiDecision array has incorrect number of elements. Data sent: ", dataToSend);
            return;
        }
        if (reward < this.rewardDeath || reward > this.rewardWin) {
            console.error("Error in makeAiDecision: reward is not between the acceptable range. Data sent: ", dataToSend);
            return;
        }
        if (typeof game_over != "boolean") {
            console.error("Error in makeAiDecision: game_over is not a boolean. Data sent: ", dataToSend);
            return;
        }

        console.log("Data sent to AI: ", dataToSend);
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
            //this.physics.controls.actions.down = data.down;
            this.physics.controls.actions.left = data.left;
            //this.physics.controls.actions.brake = data.brake;
            //this.physics.controls.actions.boost = data.boost;
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

        // Check for win
        if (currentState.percentOfTrackCompleted >= 100) {
            this.makeAiDecision(this.previousState, currentState, this.previousAiDecision, this.rewardWin, true);
            this.resetGame();
            return;
        }

        // Check for death
        //if (this.physics.car.chassis.body.position.z <= fjcConfig.deathPositionZ) {
        // if any of the rays are too short, the car has fallen off the track
        if (Object.values(this.rayLinesLengths).some(length => length <= 0.1)) {
            this.makeAiDecision(this.previousState, currentState, this.previousAiDecision, this.rewardDeath, true);
            this.resetGame();
            return;
        }

        // When game is in progress, call the AI every callFrequency ticks
        if (this.tickCount % this.callFrequency === 0 && this.tickCount > 0) {
            // Relative reward, max 1 min -1
            let relativeReward = currentState.percentOfTrackCompleted - this.previousState.percentOfTrackCompleted;
            if (relativeReward > this.relativeRewardMax) {
                relativeReward = this.relativeRewardMax;
            } else if (relativeReward < -this.relativeRewardMax) {
                relativeReward = -This.relativeRewardMax;
            } else if (relativeReward > 0 && relativeReward < 0.1) {
                relativeReward = this.rewardStagnaion;
            }
            this.makeAiDecision(this.previousState, currentState, this.previousAiDecision, relativeReward, false);
            this.tickCount = 0;
        }
    }  

    setTickFunction() {
        this.time.on('tick', () => {

            // Increment the tick count
            this.tickCount += 1;

            // Calculate the progress around the track
            this.carPositionX = this.physics.car.chassis.body.position.x;
            this.carPositionY = this.physics.car.chassis.body.position.y;
            this.carPositionZ = this.physics.car.chassis.body.position.z;
            const { closestPoint, minDistance, segmentIndex } = this.getClosestPointOnLineSegments(
                this.carPositionX,
                this.carPositionY,
                this.carPositionZ,
                this.segmentIndex
            );
            this.segmentIndex = segmentIndex;
            this.closestPoint = closestPoint;
            this.closestPointDistance = minDistance;
            this.percentOfTrackCompleted = this.calculateTrackCompletedPercent(segmentIndex, closestPoint);

            // Update the rays
            this.updateAndVisualizeRays(this.carPositionX, this.carPositionY, this.carPositionZ, this.physics.car.angle);
            //console.log(this.rayLinesLengths)

            // Automatically move forwards untill the game starts when in AI mode
            if (!this.gameInProgress && this.aiModeActive) {
                this.physics.controls.actions.up = true;
                this.physics.controls.actions.down = false;
                this.physics.controls.actions.left = false;
                this.physics.controls.actions.right = false;
                this.physics.controls.actions.brake = false;
                this.physics.controls.actions.boost = false;

                // Check if the car has passed the start line
                if (this.percentOfTrackCompleted > 0) {
                    this.gameInProgress = true;
                    this.gameStartTime = Date.now();
                    this.resetAi();
                } else {
                    return;
                }
            }

            if (!this.gameInProgress && !this.aiModeActive) {
                // Check if the car has passed the start line
                if (this.percentOfTrackCompleted > 0) {
                    this.gameInProgress = true;
                    this.gameStartTime = Date.now();
                } else {
                    return;
                }
            }

            if (this.gameInProgress) {
                this.updateHtml()

                // AI logic
                if (this.aiModeActive && this.gameInProgress) {
                    this.aiTick();
                }

                // Player logic
                if (!this.aiModeActive && this.gameInProgress) {
                    this.playerTick();
                }
            }
        });
    }

    playerTick() {
        // Check for death
        // if any of the rays are too short, the car has fallen off the track
        if (Object.values(this.rayLinesLengths).some(length => length <= this.toleranceDistanceRays)) {
            this.resetGame();
            return;
        }

    }

    /*
    * Math functions
    */

    updateAndVisualizeRays(carPosX, carPosY, carPosZ, carAngle) {
        if (!this.racetrackRaysModel) return;
        
        // Direction vectors are in car's local coordinates
        const directionsAndMaterials = {
            left: { direction: new THREE.Vector3(0, 1, 0), material: new THREE.LineBasicMaterial({ color: 0xff0000 }) }, // Pointing upwards
            right: { direction: new THREE.Vector3(0, -1, 0), material: new THREE.LineBasicMaterial({ color: 0x00ff00 }) }, // Pointing downwards
            forward: { direction: new THREE.Vector3(1, 0, 0), material: new THREE.LineBasicMaterial({ color: 0x0000ff }) }, // Pointing to the right
            forwardLeft: { direction: new THREE.Vector3(Math.sqrt(2) / 2, Math.sqrt(2) / 2, 0), material: new THREE.LineBasicMaterial({ color: 0xffff00 }) },
            forwardRight: { direction: new THREE.Vector3(Math.sqrt(2) / 2, -Math.sqrt(2) / 2, 0), material: new THREE.LineBasicMaterial({ color: 0xff00ff }) },
        };        
        
        // Remove existing ray lines from the container
        if (this.rayLines){
            Object.values(this.rayLines).forEach(line => this.container.remove(line));
        }
        this.rayLines = {};
        this.rayLinesLengths = {};
        
        const carPosition = new THREE.Vector3(carPosX, carPosY, carPosZ);
        // Car angle is already in radians
        const rotationMatrix = new THREE.Matrix4().makeRotationZ(carAngle);
        
        Object.keys(directionsAndMaterials).forEach((key) => {
            const { direction, material } = directionsAndMaterials[key];
            const rotatedDirection = direction.clone().applyMatrix4(rotationMatrix);
            const ray = new THREE.Raycaster(carPosition, rotatedDirection.normalize());
            
            const intersections = ray.intersectObject(this.racetrackRaysModel, true);
            
            let endPoint;
            if (intersections.length > 0) {
                endPoint = intersections[0].point;
            } else {
                endPoint = carPosition.clone().add(rotatedDirection.multiplyScalar(1000));
            }
            
            // Draw the visualized ray line
            const geometry = new THREE.BufferGeometry().setFromPoints([carPosition, endPoint]);
            this.rayLines[key] = new THREE.Line(geometry, material);
            this.rayLinesLengths[key] = endPoint.distanceTo(carPosition);
            this.container.add(this.rayLines[key]);
        });
    }

    getClosestPointOnLineSegments(carX, carY, carZ, lastSegmentIndex) {
        let minDistance = Infinity;
        let closestPoint = null;
        let segmentIndex = null;
    
        const points = Object.values(fjcConfig.pointsForLine);
    
        // Clamp the segment indices to the range [0, points.length - 2]
        const startIdx = Math.max(0, lastSegmentIndex - 1);
        const endIdx = Math.min(points.length - 2, lastSegmentIndex + 1);
    
        for (let i = startIdx; i <= endIdx; i++) {
            const start = new THREE.Vector3(points[i].x, points[i].y, points[i].z);
            const end = new THREE.Vector3(points[i + 1].x, points[i + 1].y, points[i + 1].z);
            const carPoint = new THREE.Vector3(carX, carY, carZ);
    
            const closest = new THREE.Vector3();
    
            // Find closest point on the line segment defined by start and end to the point
            closest.subVectors(end, start)
                .multiplyScalar(
                    ((carPoint.x - start.x) * (end.x - start.x) +
                     (carPoint.y - start.y) * (end.y - start.y) +
                     (carPoint.z - start.z) * (end.z - start.z)) /
                    start.distanceToSquared(end)
                )
                .add(start);
    
            // Clamp the closest point to the line segment
            const t = closest.clone().sub(start).dot(end.clone().sub(start)) / start.distanceToSquared(end);
            if (t < 0.0) closest.copy(start);
            else if (t > 1.0) closest.copy(end);
    
            // Calculate the distance to the closest point on the segment
            const distance = closest.distanceTo(carPoint);
    
            // Update the minimum distance and closest point and segment index
            if (distance < minDistance) {
                minDistance = distance;
                closestPoint = closest;
                segmentIndex = i;
            }
        }
    
        return { closestPoint, minDistance, segmentIndex };
    }

    calculateTrackCompletedPercent(segmentIndex, closestPoint) {
        const points = Object.values(fjcConfig.pointsForLine);
        let completedDistance = 0;
    
        for (let i = 0; i < segmentIndex; i++) {
            const start = new THREE.Vector3(points[i].x, points[i].y, points[i].z);
            const end = new THREE.Vector3(points[i + 1].x, points[i + 1].y, points[i + 1].z);
            completedDistance += start.distanceTo(end);
        }
    
        const startOfSegment = new THREE.Vector3(points[segmentIndex].x, points[segmentIndex].y, points[segmentIndex].z);
        completedDistance += startOfSegment.distanceTo(closestPoint);
    
        let totalTrackLength = 0;
        for (let i = 0; i < points.length - 1; i++) {
            const start = new THREE.Vector3(points[i].x, points[i].y, points[i].z);
            const end = new THREE.Vector3(points[i + 1].x, points[i + 1].y, points[i + 1].z);
            totalTrackLength += start.distanceTo(end);
        }
    
        return (completedDistance / totalTrackLength) * 100;
    }  

    /*
    *  UI functions
    */

    updateHtml() {
        document.getElementById("checkpoint-count").innerText = `Progress: ${this.percentOfTrackCompleted.toFixed(2)}%`;
        let elapsedTime = Date.now() - this.gameStartTime;
        let seconds = Math.floor((elapsedTime / 1000) % 60);
        let minutes = Math.floor((elapsedTime / (1000 * 60)) % 60);
        document.getElementById("lap-timer").innerText = `Time: ${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }

    setupHTML() {
        document.querySelector('.fjc-threejs-journey').removeAttribute('hidden');
        document.querySelector('.threejs-journey.js-threejs-journey').removeAttribute('hidden');

    }   

    setupLighting() {
        const ambientLight = new THREE.AmbientLight(0xffffff, 5);
        this.container.add(ambientLight);
    }

    loadRacetrack() {
        const loader = new GLTFLoader();

        // This is just for visualization
        loader.load(racetrackVizModel, (gltf) => {
            const model = gltf.scene;
            this.container.add(model);
        });

        // This is just for raycasting
        loader.load(racetrackRaysModel, (gltf) => {
            const model = gltf.scene;
            model.visible = false; // Set visible to false
            this.racetrackRaysModel = model;
            this.container.add(model);
        });

        // This is for collisions
        this.objects.add({
            //base: this.resources.items.racetrackEmpty.scene, // Empty glb file (has one tiny mesh in it)
            base: this.resources.items.racetrackEmpty.scene, // Empty glb file (has one tiny mesh in it)
            collision: this.resources.items.racetrack.scene, // This is the mesh that will be used for collision
            floorShadowTexture: null,
            offset: new THREE.Vector3(this.x, this.y, 0),
            mass: 0 // Static object
        });
    }

    addLinePathFromPoints() {
        const pointsForLine = fjcConfig.pointsForLine;
        
        const lineMaterial = new THREE.LineBasicMaterial({ color: 0x0000ff }); // blue color for central line
        const sphereMaterial = new THREE.MeshBasicMaterial({ color: 0xffff00 }); // yellow color for spheres
        
        // Function to create spheres and line from points
        const createSpheresAndLine = (pointsForLine, sphereMaterial, lineMaterial) => {
            const points = [];
            for (const key in pointsForLine) {
                if (Object.hasOwnProperty.call(pointsForLine, key)) {
                    const pointConfig = pointsForLine[key];
                    const point = new THREE.Vector3(pointConfig.x, pointConfig.y, pointConfig.z);
                    points.push(point);
        
                    // Create Spheres
                    const sphereGeometry = new THREE.SphereGeometry(0.5, 32, 32);
                    const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
                    sphere.position.copy(point);
                    this.container.add(sphere);
                }
            }
            
            // Create Line
            const geometry = new THREE.BufferGeometry().setFromPoints(points);
            const line = new THREE.Line(geometry, lineMaterial);
            this.container.add(line);
        }
        createSpheresAndLine(pointsForLine, sphereMaterial, lineMaterial);
    }
    
}