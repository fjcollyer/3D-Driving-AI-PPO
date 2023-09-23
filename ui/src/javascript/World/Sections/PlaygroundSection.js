import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import racetrackModel from '../../../models/racetrack/racetrackViz.glb';

export default class PlaygroundSection {
    constructor(_options) {
        // Options
        this.time = _options.time;
        this.resources = _options.resources;
        this.objects = _options.objects;
        this.areas = _options.areas;
        this.tiles = _options.tiles;
        this.debug = _options.debug;
        this.x = _options.x;
        this.y = _options.y;
        
        // Set up
        this.container = new THREE.Object3D();
        this.container.matrixAutoUpdate = false;

        this.setupLighting();
        this.loadRacetrack();
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
            base: this.resources.items.racetrack.scene, // Visual representation of the racetrack
            collision: this.resources.items.racetrack.scene, // Use the same mesh for collision for now
            floorShadowTexture: null, // If you have a shadow texture for the racetrack, add it here
            offset: new THREE.Vector3(this.x, this.y, 0),
            mass: 0 // Static object
        });
    }
}