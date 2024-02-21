const fjcConfig = require('../../fjcConfig.js');

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

// Models
import racetrackVizModel from '../../../models/racetrack/racetrackViz.glb';
import racetrackRaysModel from '../../../models/racetrack/racetrackRays.glb';
import racetrackCollisionModel from '../../../models/racetrack/racetrack-physics.glb';

// AI
import PPOAgent from './PPOAgent.js';

export default class Racetrack {
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

        // Set variables that are common with the Flask app
        this.getCommonWithFlaskConfig();

        // Set up HTML elements
        this.isMuted = false;
        this.muteByDefault = true;
        this.currentMode = "ai-button-3"; // Name the modes per the button IDs
        this.setupHTML();

        // Tick logic
        this.tickCount = 0;
        this.lastTickTime = Date.now();

        // General AI game logic
        this.aiModeActive = true; // This determines whether the AI plays or the player plays. It does not affect whether we are in training mode or not
        this.gamePaused = false; // Used to pause the game when in training mode
        this.agentId = Math.random().toString(36).substr(2, 9); // Used to identify the agent in the Flask app when in training mode
        this.toleranceDistanceRays = 0.8; // If any of the rays are shorter than this distance we consider the car to have fallen off the track
        this.racetrackRaysModel = null; // Used for raycasting, set in loadRacetrack()
        this.racetrackDownRayModel = null; // Used for raycasting, set in loadRacetrack()
        this.call_frequency = 60 / 4;

        // Game logic setup
        this.resetGame(true);

        // UI setup
        this.container = new THREE.Object3D();
        this.container.matrixAutoUpdate = false;
        this.setupLighting();
        this.loadRacetrack();
        // this.addLinePathFromPoints();

        // Handle setting touch controls
        console.log("fjcConfig.touchUser: " + fjcConfig.touchUser);
        // this.physics.controls.setTouch()

        // Start the main tick function / Event loop
        this.setTickFunction();

    }

    getCommonWithFlaskConfig() {
        fetch('/common-with-flask-config.json')
            .then(response => response.json())
            .then(config => {
                console.log("Configuration loaded:", config);

                // Set the properties based on the fetched configuration
                this.flask_url = config.flask_url;
                this.training_mode = config.training_mode;
                this.actions_list = config.actions_list;
                this.state_space = config.state_space;
                this.action_mappings = config.action_mappings;

                this.tfjs_model_paths = {
                    beginner: {
                        actor: config.path_to_tfjs_actor_beginner,
                        critic: config.path_to_tfjs_critic_beginner
                    },
                    intermediate: {
                        actor: config.path_to_tfjs_actor_intermediate,
                        critic: config.path_to_tfjs_critic_intermediate
                    },
                    advanced: {
                        actor: config.path_to_tfjs_actor_advanced,
                        critic: config.path_to_tfjs_critic_advanced
                    }
                };

                console.log("this.tfjs_model_paths: ", this.tfjs_model_paths);

                // Initialize PPOAgent with the fetched configuration
                if (this.training_mode) {
                    console.log("Training mode is enabled.");
                } else {
                    this.ppo_agent_beginner = new PPOAgent(this.tfjs_model_paths.beginner.actor, this.tfjs_model_paths.beginner.critic, this.actions_list, this.action_mappings, this.state_space);
                    this.ppo_agent_intermediate = new PPOAgent(this.tfjs_model_paths.intermediate.actor, this.tfjs_model_paths.intermediate.critic, this.actions_list, this.action_mappings, this.state_space);
                    this.ppo_agent_advanced = new PPOAgent(this.tfjs_model_paths.advanced.actor, this.tfjs_model_paths.advanced.critic, this.actions_list, this.action_mappings, this.state_space);
                }
            })
            .catch(error => console.error("Error loading configuration:", error));
    }

    resetGame(firstReset = false) {
        if (firstReset) {
            console.log("First reset");
            this.physics.world.gravity.set(0, 0, 0);
            setTimeout(() => {
                this.physics.world.gravity.set(0, 0, fjcConfig.gravityZ);
            }
                , 2000);
        } else {
            console.log("Not first reset");
            this.physics.world.gravity.set(0, 0, fjcConfig.gravityZ);
        }

        // Reset the game logic variables
        this.gameInProgress = false;
        this.gameStartTime = null;
        this.countDownInProgress = false;

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
        document.getElementById("progress").innerText = `Progress: 0%`;
        document.getElementById("lap-timer").innerText = `Lap Time: 00:00`;

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

        // Angle of the car in x-y plane (direction car is pointing) | Normalized to ~ [0, 1]
        // normalizedState.carAngle = (this.physics.car.angle + Math.PI) / (2 * Math.PI);

        // Angle z of the car (tilt of the car) |  Normalized to ~ [0, 1]
        // normalizedState.carAngleZ = (this.physics.car.pitchAngle / 90)

        // Speed of the car | Normalized to ~[0, 1]
        normalizedState.carSpeed = this.physics.car.speed * 10

        normalizedState.left = this.physics.controls.actions.left;
        normalizedState.right = this.physics.controls.actions.right;

        // Ray lengths | Normalized to [0, 1]
        const maxRayLength = 20;
        normalizedState.rayLengthLeft = Math.min(this.rayLinesLengths.left, maxRayLength) / maxRayLength;
        normalizedState.rayLengthRight = Math.min(this.rayLinesLengths.right, maxRayLength) / maxRayLength;
        normalizedState.rayLengthForward = Math.min(this.rayLinesLengths.forward, maxRayLength) / maxRayLength;
        normalizedState.rayLengthForwardLeft1 = Math.min(this.rayLinesLengths.forwardLeft1, maxRayLength) / maxRayLength;
        normalizedState.rayLengthForwardLeft2 = Math.min(this.rayLinesLengths.forwardLeft2, maxRayLength) / maxRayLength;
        normalizedState.rayLengthForwardRight1 = Math.min(this.rayLinesLengths.forwardRight1, maxRayLength) / maxRayLength;
        normalizedState.rayLengthForwardRight2 = Math.min(this.rayLinesLengths.forwardRight2, maxRayLength) / maxRayLength;

        // Downward ray length | Normalized to [0, 1]
        // const maxDownwardRayLength = 5;
        // normalizedState.rayLengthDown = Math.min(this.rayLinesLengths.downward, maxDownwardRayLength) / maxDownwardRayLength;


        // Ensure state space consistency with Flask app
        if (this.state_space !== Object.keys(normalizedState).length) {
            console.log("Error: state_space !== Object.keys(normalizedState).length");
            console.log("this.state_space = " + this.state_space);
            console.log("Object.keys(normalizedState).length = " + Object.keys(normalizedState).length);
            throw new Error("state_space !== Object.keys(normalizedState).length");
        }
        return normalizedState;
    }

    // Check if the agent should unpause
    checkUnpause() {
        if (this.gamePaused) {
            console.log("Checking if game should unpause");
            fetch(this.flask_url + `/check_unpause?agent_id=${this.agentId}`)
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
    *   This is used when not in training mode 
    *
    *  1. Send data to the AI
    *  2. Receive the AI's decision
    *  3. Make the decision
    */
    makeAiDecisionPreTrained(currentState, gameOver, win) {
        // We simply send the current state to the AI and receive the action
        const startTime = Date.now();

        // console.log("this.currentMode: " + this.currentMode);

        let currentAgent = null;
        if (this.currentMode === "ai-button-1") {
            currentAgent = this.ppo_agent_beginner;
        } else if (this.currentMode === "ai-button-2") {
            currentAgent = this.ppo_agent_intermediate;
        } else if (this.currentMode === "ai-button-3") {
            currentAgent = this.ppo_agent_advanced;
        } else {
            console.log("Error: currentMode not recognized");
            console.log("currentMode = " + this.currentMode);
        }

        currentAgent.chooseAction(currentState).then(({ action, actionProbabilities, value }) => {
            const actionDict = currentAgent.getActionDict(action);

            this.actions_list.forEach((action) => {
                const responseTime = Date.now() - startTime;
                // console.log(`Response time: ${responseTime} ms`);
                this.physics.controls.actions[action] = actionDict[action];
            });
        });
    }


    /*
    *  This is used when in training mode
    *
    *  1. Send data to the AI
    *  2. Receive the AI's decision
    *  3. Check if we should pause the game due to training in Flask
    *  4. If not paused, make the decision
    */
    makeAiDecision(currentState, gameOver, win) {
        const dataToSend = {
            agent_id: this.agentId,
            observation: currentState,
            done: gameOver,
            win: win,
            time_since_game_start: Date.now() - this.gameStartTime
        };

        const startTime = Date.now();
        fetch(this.flask_url + "/get_action", {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(dataToSend),
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
                    this.actions_list.forEach((action) => {
                        const responseTime = Date.now() - startTime;
                        // console.log(`Response time: ${responseTime} ms`);
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
        if (!this.gameInProgress) {
            return;
        }
        const currentState = this.getState();

        // Check for win
        if ((currentState.percentOfTrackCompleted * 100) >= 100) { // * 100 because percentOfTrackCompleted is normalized to [0, 1]
            console.log("Win");
            if (this.training_mode) {
                this.makeAiDecision(currentState, true, true);
            } else {
                this.makeAiDecisionPreTrained(currentState, true, true);
            }
            this.resetGame();
            return;
        }

        // Check for death, if any of the rays (excluding the downward ray) are too short the car has fallen off the track
        // Only in training mode
        if (this.training_mode) {
            if (Object.entries(this.rayLinesLengths).filter(([key, _]) => key !== 'downward').some(([, length]) => length <= this.toleranceDistanceRays)) {
                console.log("Death by falling off the track");
                if (this.training_mode) {
                    this.makeAiDecision(currentState, true, false);
                } else {
                    this.makeAiDecisionPreTrained(currentState, true, false);
                }
                this.resetGame();
                return;
            }
        }
        // Default death by falling off the track
        if (this.physics.car.chassis.body.position.z <= fjcConfig.deathPositionZ) {
            if (this.training_mode) {
                this.makeAiDecision(currentState, true, false);
            } else {
                this.makeAiDecisionPreTrained(currentState, true, false);
            }
            this.resetGame();
            return;
        }
        // Check for death by staying still
        // Only in training mode
        if (this.training_mode) {
            if (this.physics.car.speed < 0.001 && (Date.now() - this.gameStartTime) > 5000) {
                console.log("Death by staying still");
                if (this.training_mode) {
                    this.makeAiDecision(currentState, true, false);
                } else {
                    this.makeAiDecisionPreTrained(currentState, true, false);
                }
                this.resetGame();
                return;
            }
        }

        // When game is in progress, call the AI every this.call_frequency ticks
        if (this.tickCount % this.call_frequency === 0 && this.tickCount > 0) {
            if (this.training_mode) {
                this.makeAiDecision(currentState, false, false);
            } else {
                this.makeAiDecisionPreTrained(currentState, false, false);
            }
            this.tickCount = 0;
        }
    }

    setTickFunction() {
        this.time.on('tick', () => {

            // Only start the tick function when the PPOAgent is initialized
            if (!this.training_mode) {
                if (!this.ppo_agent_beginner || !this.ppo_agent_intermediate || !this.ppo_agent_advanced) {
                    console.log("PPOAgents not initialized yet");
                    return;
                }
                if (!this.ppo_agent_beginner.actorModel || !this.ppo_agent_beginner.criticModel || !this.ppo_agent_intermediate.actorModel || !this.ppo_agent_intermediate.criticModel || !this.ppo_agent_advanced.actorModel || !this.ppo_agent_advanced.criticModel) {
                    console.log("PPOAgent criticModel or actorModel not loaded yet for one or more agents");
                    return;
                }
            }

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
            this.updateAndVisualizeRays(this.carPositionX, this.carPositionY, this.carPositionZ, this.physics.car.angle, this.training_mode);

            // Wait if the game is paused
            if (this.gamePaused) {
                return;
            }

            // 1 second countdown before the game starts
            if (!this.gameInProgress) {
                if (this.countDownInProgress) {
                    return;
                }
                if (this.carPositionZ > 36) {
                    return;
                }
                this.countDownInProgress = true;
                setTimeout(() => {
                    this.gameInProgress = true;
                    this.countDownInProgress = false;
                    this.gameStartTime = Date.now();
                }, 100);
                return;
            }

            // In game logic
            if (this.gameInProgress) {
                this.updateHtml();

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
        // if (Object.entries(this.rayLinesLengths).filter(([key, _]) => key !== 'downward').some(([, length]) => length <= this.toleranceDistanceRays)) {
        //     this.resetGame();
        //     return;
        // }
        if (this.physics.car.chassis.body.position.z <= fjcConfig.deathPositionZ) {
            this.resetGame();
            return;
        }
        const state = this.getState();
    }

    /*
    * Math functions
    */

    updateAndVisualizeRays(carPosX, carPosY, carPosZ, carAngle, visualize) {
        if (!this.racetrackRaysModel || !this.racetrackDownRayModel) {
            console.log("Racetrack models not loaded yet");
            return;
        }

        // Initialize rayLines and rayLinesLengths if they don't exist
        if (!this.rayLines) {
            this.rayLines = {};
            this.rayLinesLengths = {};
        }

        const directions = {
            left: new THREE.Vector3(0, 1, 0),
            right: new THREE.Vector3(0, -1, 0),
            forward: new THREE.Vector3(1, 0, 0),
            forwardLeft1: new THREE.Vector3(Math.cos(Math.PI / 8), Math.sin(Math.PI / 8), 0),
            forwardLeft2: new THREE.Vector3(Math.sqrt(2) / 2, Math.sqrt(2) / 2, 0),
            forwardRight1: new THREE.Vector3(Math.cos(-Math.PI / 8), Math.sin(-Math.PI / 8), 0),
            forwardRight2: new THREE.Vector3(Math.sqrt(2) / 2, -Math.sqrt(2) / 2, 0),
            downward: new THREE.Vector3(0, 0, -1)
        };

        const carPosition = new THREE.Vector3(carPosX, carPosY, carPosZ);
        const rotationMatrix = new THREE.Matrix4().makeRotationZ(carAngle);

        Object.keys(directions).forEach((key) => {
            const direction = directions[key];
            const rotatedDirection = direction.clone().applyMatrix4(rotationMatrix);

            const rayOrigin = carPosition;
            const ray = new THREE.Raycaster(rayOrigin, rotatedDirection.normalize());

            let intersections;
            if (key === 'downward') {
                intersections = ray.intersectObject(this.racetrackDownRayModel, true);
            } else {
                intersections = ray.intersectObject(this.racetrackRaysModel, true);
            }

            let endPoint;
            if (intersections.length > 0) {
                endPoint = intersections[0].point;
            } else {
                endPoint = rayOrigin.clone().add(rotatedDirection.multiplyScalar(1000));
            }

            // Update ray lines lengths always
            this.rayLinesLengths[key] = endPoint.distanceTo(rayOrigin);

            // Visualize if in the correct mode
            if (visualize) {
                if (!this.rayLines[key]) {
                    const material = new THREE.LineBasicMaterial({ color: this.getColorForKey(key) });
                    const geometry = new THREE.BufferGeometry().setFromPoints([rayOrigin, endPoint]);
                    this.rayLines[key] = new THREE.Line(geometry, material);
                    this.container.add(this.rayLines[key]);
                } else {
                    this.rayLines[key].geometry.setFromPoints([rayOrigin, endPoint]);
                }
            }
        });
    }

    getColorForKey(key) {
        const colors = {
            left: 0xff0000,
            right: 0x00ff00,
            forward: 0x0000ff,
            forwardLeft1: 0xffff33,
            forwardLeft2: 0xffff00,
            forwardRight1: 0xff33ff,
            forwardRight2: 0xff00ff,
            downward: 0x00ffff
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
        try {
            document.getElementById("progress").innerText = `Progress: ${this.percentOfTrackCompleted.toFixed(0)}%`;
            let elapsedTime = Date.now() - this.gameStartTime;
            let seconds = Math.floor((elapsedTime / 1000) % 60);
            let minutes = Math.floor((elapsedTime / (1000 * 60)) % 60);
            document.getElementById("lap-timer").innerText = `Lap Time: ${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        } catch (error) {
            console.error("An error occurred in updateHtml:", error);
        }
    }

    setupHTML() {
        // unhide the menu class is header
        const header = document.querySelector('header');
        header.removeAttribute('hidden');
        setTimeout(() => {
            header.style.opacity = 1;
        }, 10);

        // Function to dispatch 'm' keydown event
        const emitMKeydown = () => {
            const event = new KeyboardEvent('keydown', {
                key: 'm',
                code: 'KeyM',
                bubbles: true,
                cancelable: true
            });
            window.dispatchEvent(event);
        };

        // Add event listener for mute button to emit 'm' keydown event
        const muteButton = document.getElementById('muteIcon');
        muteButton.addEventListener('click', emitMKeydown);

        // Listen for the 'm' keydown to toggle mute state and update icon
        window.addEventListener('keydown', (event) => {
            if (event.key === 'm') {
                // Assuming isMuted is defined in this scope; adjust as necessary
                this.isMuted = !this.isMuted;
                const muteIcon = document.getElementById('muteIcon');
                muteIcon.src = this.isMuted ? '/mute.svg' : '/unmute.svg';

                // Prevent default action to avoid any side effects
                event.preventDefault();
            }
        });

        // Mute by default if this.isMuted is true
        if (this.muteByDefault) {
            emitMKeydown();
        }
        // Automatically mute on mobile devices
        // if (/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)) {
        //     emitMKeydown();
        // }

        const buttonIds = ['human-button', 'ai-button-1', 'ai-button-2', 'ai-button-3'];

        // Function to apply animated text effect
        function applyTextAnimation(button, text) {
            console.log('Applying animation to:', button.id, 'with text:', text);
            let div = document.createElement('div'),
                letters = text.trim().split('');

            div.innerHTML = '';
            letters.forEach((letter, index, array) => {
                let element = document.createElement('span'),
                    part = (index >= array.length / 2) ? -1 : 1,
                    position = (index >= array.length / 2) ? array.length / 2 - index + (array.length / 2 - 1) : index,
                    move = position / (array.length / 2),
                    rotate = 1 - move;

                element.innerHTML = !letter.trim() ? '&nbsp;' : letter;
                element.style.setProperty('--move', move);
                element.style.setProperty('--rotate', rotate);
                element.style.setProperty('--part', part);

                div.appendChild(element);
            });

            button.innerHTML = '';
            button.appendChild(div);
        }

        function updateModeInNav(text) {
            let modeInNavText = document.getElementById('mode-in-nav');

            if (text === 'human-button') {
                text = 'Human';
            } else if (text === 'ai-button-1') {
                text = 'AI (Beginner)';
            } else if (text === 'ai-button-2') {
                text = 'AI (Intermediate)';
            } else if (text === 'ai-button-3') {
                text = 'AI (Advanced)';
            }
            modeInNavText.textContent = text;
        }

        function hideDropdown(targetDropdown) {
            if (targetDropdown) {
                targetDropdown.classList.add('hidden');
                header.classList.remove('navbar-dropdown-open');
                var dropdownArrow = targetDropdown.previousElementSibling.querySelector('.dropdown__arrow');
                if (dropdownArrow) {
                    dropdownArrow.classList.remove('open');
                }
                console.log("hideDropdown: ", targetDropdown);
            } else {
                console.error('hideDropdown: targetDropdown is not defined');
            }
        }

        function hideAllDropdowns() {
            var allDropdowns = document.querySelectorAll('.dropdown__container');
            allDropdowns.forEach(function (dropdown) {
                hideDropdown(dropdown); // Utilize the existing hideDropdown function
            });
        }

        function hideOtherDropdowns(exceptDropdown) {
            // Query all dropdown elements
            var allDropdowns = document.querySelectorAll('.dropdown__container');
            allDropdowns.forEach(function (dropdown) {
                if (dropdown !== exceptDropdown) {
                    dropdown.classList.add('hidden'); // Hide dropdown
                    var dropdownArrow = dropdown.previousElementSibling.querySelector('.dropdown__arrow');
                    if (dropdownArrow) {
                        dropdownArrow.classList.remove('open'); // Adjust arrow state
                    }
                }
            });
        }

        function showDropdown(targetDropdown) {
            if (targetDropdown) {
                hideOtherDropdowns(targetDropdown); // Hide other dropdowns first
                targetDropdown.classList.remove('hidden');
                header.classList.add('navbar-dropdown-open');
                var dropdownArrow = targetDropdown.previousElementSibling.querySelector('.dropdown__arrow');
                if (dropdownArrow) {
                    dropdownArrow.classList.add('open');
                }
                console.log("showDropdown: ", targetDropdown);
            } else {
                console.error('showDropdown: targetDropdown is not defined');
            }
        }

        document.addEventListener('click', function (event) {
            var insideDropdown = event.target.closest('.dropdown__container');
            var insideNavLink = event.target.closest('#mode_nav_link, #info_nav_link'); // Adjust selectors as necessary

            // If the click is not inside a dropdown or nav link, hide all dropdowns
            if (!insideDropdown && !insideNavLink) {
                hideAllDropdowns();
            }
        });


        document.getElementById('mode_nav_link').addEventListener('click', function () {
            var dropdown = this.nextElementSibling;
            if (dropdown.classList.contains('hidden')) {
                showDropdown(dropdown);
            } else {
                hideDropdown(dropdown);
            }
        });
        document.getElementById('info_nav_link').addEventListener('click', function () {
            var dropdown = this.nextElementSibling;
            if (dropdown.classList.contains('hidden')) {
                showDropdown(dropdown);
            } else {
                hideDropdown(dropdown);
            }
        });

        // Function to check for touch support
        function isTouchDevice() {
            return 'ontouchstart' in window || navigator.maxTouchPoints > 0 || navigator.msMaxTouchPoints > 0;
        }

        document.getElementById('mode-dropdown-item').addEventListener('mouseenter', function () {
            if (isTouchDevice()) return; // Ignore hover on touch devices
            var dropdown = this.querySelector('.dropdown__container'); // Select the dropdown container
            showDropdown(dropdown);
        });

        document.getElementById('mode-dropdown-item').addEventListener('mouseleave', function () {
            if (isTouchDevice()) return; // Ignore hover on touch devices
            var dropdown = this.querySelector('.dropdown__container'); // Select the dropdown container
            hideDropdown(dropdown);
        });

        document.getElementById('info-dropdown-item').addEventListener('mouseenter', function () {
            if (isTouchDevice()) return; // Ignore hover on touch devices
            var dropdown = this.querySelector('.dropdown__container'); // Select the dropdown container
            showDropdown(dropdown);
        });

        document.getElementById('info-dropdown-item').addEventListener('mouseleave', function () {
            if (isTouchDevice()) return; // Ignore hover on touch devices
            var dropdown = this.querySelector('.dropdown__container'); // Select the dropdown container
            hideDropdown(dropdown);
        });


        function displayNewModeMessage(mode) {
            const popupContainer = document.getElementById('popup-container');
            const popupText = document.getElementById('popup-text');

            let modeText = "Mode: ";
            if (mode === 'human-button') {
                modeText += 'Human';
            } else if (mode === 'ai-button-1') {
                modeText += 'AI (Beginner)';
            }
            else if (mode === 'ai-button-2') {
                modeText += 'AI (Intermediate)';
            }
            else if (mode === 'ai-button-3') {
                modeText += 'AI (Advanced)';
            }

            // First, make sure the popup is hidden
            popupContainer.style.opacity = '0';
            popupContainer.style.display = 'none';

            // Update the popup text
            popupText.textContent = modeText;

            // Show the popup container before fading in
            popupContainer.style.display = 'block';

            // Fade in
            setTimeout(() => {
                popupContainer.style.opacity = '1';
            }, 0);

            // Stay for 2s then fade out
            setTimeout(() => {
                if (popupText.textContent === modeText) { // Check if the text matches the current mode
                    popupContainer.style.opacity = '0';

                    // Hide the popup container after it fades out
                    setTimeout(() => {
                        if (popupText.textContent === modeText) { // Check again before hiding
                            popupContainer.style.display = 'none';
                        }
                    }, 500); // Match the fade-out duration
                }
            }, 2500); // 500ms fade in + 2000ms stay
        }

        buttonIds.forEach(buttonId => {
            const button = document.getElementById(buttonId);
            if (button) {
                applyTextAnimation(button, button.textContent);

                button.addEventListener('mouseenter', () => {
                    if (!button.classList.contains('out')) {
                        button.classList.add('in');
                    }
                });

                button.addEventListener('mouseleave', () => {
                    if (button.classList.contains('in')) {
                        // button.classList.add('out');
                        setTimeout(() => button.classList.remove('in', 'out'), 950);
                    }
                });

                // Updated click event listener to manage the selection state and update text with animation
                button.addEventListener('click', (event) => {
                    event.preventDefault();
                    if (button.id === this.currentMode) {
                        return;
                    }
                    this.currentMode = button.id;
                    if (this.currentMode === "human-button") {
                        this.aiModeActive = false;
                        for (const action of this.actions_list) {
                            this.physics.controls.actions[action] = false;
                        }
                        setTimeout(() => {
                            for (const action of this.actions_list) {
                                this.physics.controls.actions[action] = false;
                            }
                        }, 200);
                    } else {
                        this.aiModeActive = true;
                    }

                    buttonIds.forEach(id => {
                        const otherButton = document.getElementById(id);
                        if (otherButton !== button) {
                            otherButton.classList.remove('selected-button', 'in'); // Remove 'in' if it's not needed here
                            otherButton.classList.add('non-selected-button');
                            applyTextAnimation(otherButton, 'Select'); // Update non-active buttons without triggering animations
                        }
                    });

                    button.classList.add('selected-button');
                    button.classList.remove('non-selected-button', 'in'); // Remove 'in' to avoid triggering animation
                    applyTextAnimation(button, 'Selected');
                    updateModeInNav(button.id);

                    // Hide the dropdown
                    const targetDropdown = button.closest('.dropdown__container');
                    hideDropdown(targetDropdown);
                    displayNewModeMessage(button.id);
                });
            }
        });

        // Set the initial mode
        for (const id of buttonIds) {
            const button = document.getElementById(id);
            if (button.id === this.currentMode) {
                button.classList.add('selected-button');
                button.classList.remove('non-selected-button');
                applyTextAnimation(button, 'Selected');
                updateModeInNav(button.id);
            } else {
                let nonSelectedButton = document.getElementById(id);
                nonSelectedButton.classList.remove('selected-button');
                nonSelectedButton.classList.add('non-selected-button');
                applyTextAnimation(nonSelectedButton, 'Select');
            }
        }
    }

    setupLighting() {
        const ambientLight = new THREE.AmbientLight(0xffffff, 4);
        this.container.add(ambientLight);
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

    loadRacetrack() {
        const loader0 = new GLTFLoader();
        const loader1 = new GLTFLoader();
        const loader2 = new GLTFLoader();

        // Used for: Visual: True, Collision: False, Raycasting: False

        if (!this.training_mode) {
            loader0.load(racetrackVizModel, (gltf) => {
                const model = gltf.scene;
                this.container.add(model);
            });
        }

        // Used for: Visual: False, Collision: False, Raycasting: False
        loader1.load(racetrackRaysModel, (gltf) => {
            const model = gltf.scene;
            model.visible = false;
            this.racetrackRaysModel = model;
            this.container.add(model);
        });

        // Used for: Visual: False, Collision: False, Raycasting: True
        loader2.load(racetrackCollisionModel, (gltf) => {
            const model = gltf.scene;
            model.visible = false;
            this.racetrackDownRayModel = model;
            this.container.add(model);
        });

        // Used for: Visual: True (base is visable, in prod we will have an empty file for base so its not visable), Collision: True, Raycasting: False
        let base;
        if (!this.training_mode) {
            base = this.resources.items.racetrackEmpty.scene;
        } else {
            base = this.resources.items.racetrackPhysics.scene;
        }
        this.objects.add({
            base: base,
            collision: this.resources.items.racetrackPhysics.scene,
            floorShadowTexture: null,
            offset: new THREE.Vector3(this.x, this.y, 0),
            mass: 0 // 0 = static/fixed object
        });
    }

}