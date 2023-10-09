const fjcConfig = require('../../fjcConfig.js');

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

import racetrackVizModel from '../../../models/racetrack/racetrackViz.glb';
import racetrackRaysModel from '../../../models/racetrack/racetrackRays.glb';

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
        this.toleranceDistanceRays = 0.8;
        this.actionList = ["right", "left", "up", "boost"]
        this.gamePaused = false;
        this.agentId = Math.random().toString(36).substr(2, 9);

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

        // Reset the controls
        this.physics.controls.actions.up = false;
        this.physics.controls.actions.down = false;
        this.physics.controls.actions.left = false;
        this.physics.controls.actions.right = false;
        this.physics.controls.actions.brake = false;
        this.physics.controls.actions.boost = false;
    }
    
    getState() {
        let normalizedState = {};
    
        // Percent of the track completed | Normalized to [0, 1]
        normalizedState.percentOfTrackCompleted = this.percentOfTrackCompleted / 100;
    
        // Speed of the car | Normalized to ~[0, 1]
        normalizedState.carSpeed = this.physics.car.speed * 10
    
        // Ray lengths | Normalized to [0, 1]
        // First set the max value to 20, then normalize as values can be very high sometimes
        const maxRayLength = 20;
        normalizedState.rayLengthLeft = Math.min(this.rayLinesLengths.left, maxRayLength) / maxRayLength;
        normalizedState.rayLengthRight = Math.min(this.rayLinesLengths.right, maxRayLength) / maxRayLength;
        normalizedState.rayLengthForward = Math.min(this.rayLinesLengths.forward, maxRayLength) / maxRayLength;
        normalizedState.rayLengthForwardLeft = Math.min(this.rayLinesLengths.forwardLeft, maxRayLength) / maxRayLength;
        normalizedState.rayLengthForwardRight = Math.min(this.rayLinesLengths.forwardRight, maxRayLength) / maxRayLength;

        // Angle of the car in x-y plane (direction car is pointing)
        normalizedState.carAngle = this.physics.car.angle;

        // Z position of the car | Normalized to ~ [-1, 1]
        normalizedState.carPositionZ = this.physics.car.chassis.body.position.z / 100;

        return normalizedState;
    }

    // Check if the agent should unpause
    checkUnpause() {
        if (this.gamePaused) {
            console.log("Checking if game should unpause");
            fetch(`http://localhost:5001/check_unpause?agent_id=${this.agentId}`)
            .then(response => response.json())
            .then(data => {
                if (data.unpause) {
                    console.log("Unpausing game. Data from check_unpause: ", data);
                    this.gamePaused = false;
                } else {
                    setTimeout(() => this.checkUnpause(), 500);  // Use arrow function to retain this context.
                }
            })
            .catch(error => console.error('Unpause check error:', error));
        }
    }

    /*
    *  1. Send data to the AI
    *  2. Receive the AI's decision
    *  3. Make the decision
    */
    makeAiDecision(currentState, gameOver, win) {
        const dataToSend = {
            agent_id: this.agentId,
            observation: currentState,
            done: gameOver,
            win: win
        };
        if (gameOver) {
            console.log("Game over. Data from get_action: ", dataToSend);
        }

        fetch('http://localhost:5001/get_action', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(dataToSend)
        })
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP error from /get_action: ${response.status} ${response.statusText}`);
            }
            return response.json();
        })
        .then(data => {
            if (data.pause) {
                console.log("Pausing game. Data from get_action: ", data);
                this.gamePaused = true;
                this.resetGame();
                this.checkUnpause();  // Begin periodic checks for unpause.
            } else {
                this.actionList.forEach((action) => {
                    this.physics.controls.actions[action] = data.action[action];
                });
            }
        })
        .catch(error => console.error('Error calling API:', error));
    }


    aiTick() {
        // Stop the car from moving if the game is paused
        if (this.gamePaused) {
            this.physics.controls.actions.up = false;
            return;
        }
        const currentState = this.getState();

        // Check for win
        if ((currentState.percentOfTrackCompleted * 100) >= 100) { // * 100 because percentOfTrackCompleted is normalized to [0, 1]
            this.makeAiDecision(currentState, true, true);
            this.resetGame();
            return;
        }

        // Check for death, if any of the rays are too short, the car has fallen off the track
        if (Object.values(this.rayLinesLengths).some(length => length <= this.toleranceDistanceRays)) {
            this.makeAiDecision(currentState, true, false);
            this.resetGame();
            return;
        }
        // Fall back if the first condition fails
        if (this.physics.car.chassis.body.position.z <= fjcConfig.deathPositionZ) {
            this.makeAiDecision(currentState, true, false);
            this.resetGame();
            return;
        }

        // Check for auto boost zone
        if (this.percentOfTrackCompleted > 12.6 && this.percentOfTrackCompleted < 16) {
            this.physics.controls.actions.boost = true;
            this.physics.controls.actions.up = true;
            return;
        } else if (this.percentOfTrackCompleted > 16 && this.percentOfTrackCompleted < 16.5) {
            this.physics.controls.actions.boost = false;
            this.physics.controls.actions.up = false;
            return;
        }

        // When game is in progress, call the AI every callFrequency ticks
        if (this.tickCount % this.callFrequency === 0 && this.tickCount > 0) {
            this.makeAiDecision(currentState, false, false);
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

        const state = this.getState();
        console.log(state);

    }

    /*
    * Math functions
    */

    updateAndVisualizeRays(carPosX, carPosY, carPosZ, carAngle) {
        if (!this.racetrackRaysModel) return;
    
        // Initialize rayLines and rayLinesLengths if they don't exist
        if (!this.rayLines) {
            this.rayLines = {};
            this.rayLinesLengths = {};
        }
        
        const directions = {
            left: new THREE.Vector3(0, 1, 0), // Pointing upwards
            right: new THREE.Vector3(0, -1, 0), // Pointing downwards
            forward: new THREE.Vector3(1, 0, 0), // Pointing to the right
            forwardLeft: new THREE.Vector3(Math.sqrt(2) / 2, Math.sqrt(2) / 2, 0),
            forwardRight: new THREE.Vector3(Math.sqrt(2) / 2, -Math.sqrt(2) / 2, 0),
        };
    
        const carPosition = new THREE.Vector3(carPosX, carPosY, carPosZ);
        // Car angle is already in radians
        const rotationMatrix = new THREE.Matrix4().makeRotationZ(carAngle);
        
        Object.keys(directions).forEach((key) => {
            const direction = directions[key];
            const rotatedDirection = direction.clone().applyMatrix4(rotationMatrix);
            
            // Lift the forward ray in position 0.5 z
            const rayOrigin = key === 'forward' ? carPosition.clone().add(new THREE.Vector3(0, 0, 0.5)) : carPosition;
            
            const ray = new THREE.Raycaster(rayOrigin, rotatedDirection.normalize());
            
            const intersections = ray.intersectObject(this.racetrackRaysModel, true);
            
            let endPoint;
            if (intersections.length > 0) {
                endPoint = intersections[0].point;
            } else {
                endPoint = rayOrigin.clone().add(rotatedDirection.multiplyScalar(1000));
            }
            
            // If ray line for key doesn't exist, create it
            if (!this.rayLines[key]) {
                const material = new THREE.LineBasicMaterial({ color: this.getColorForKey(key) });
                const geometry = new THREE.BufferGeometry().setFromPoints([rayOrigin, endPoint]);
                this.rayLines[key] = new THREE.Line(geometry, material);
                this.container.add(this.rayLines[key]);
            } else {
                // If ray line for key already exists, update it
                this.rayLines[key].geometry.setFromPoints([rayOrigin, endPoint]);
            }
            
            this.rayLinesLengths[key] = endPoint.distanceTo(rayOrigin);
        });
    }    
    
    getColorForKey(key) {
        const colors = {
            left: 0xff0000,
            right: 0x00ff00,
            forward: 0x0000ff,
            forwardLeft: 0xffff00,
            forwardRight: 0xff00ff,
        };
    
        return colors[key];
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
        // loader.load(racetrackVizModel, (gltf) => {
        //     const model = gltf.scene;
        //     this.container.add(model);
        // });

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
            base: this.resources.items.racetrack.scene, // Empty glb file (has one tiny mesh in it)
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