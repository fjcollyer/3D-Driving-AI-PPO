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
        //this.addNumberToScene();
    }  

    addNumberToScene() {
        const numberTexture = this.createNumberTexture();
    
        const geometry = new THREE.PlaneBufferGeometry(4, 4);
        const material = new THREE.MeshBasicMaterial({ map: numberTexture, transparent: true, depthWrite: false });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(-20, 0, 5); // You can adjust this position as needed
        mesh.rotation.x = Math.PI / 2; // Rotate 90 degrees        
        this.container.add(mesh);
    }    

    createNumberTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 256;
        const context = canvas.getContext('2d');
    
        // Style the number
        context.fillStyle = '#FFFFFF'; // White color
        context.font = 'bold 128px Arial';
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillText('10', canvas.width / 2, canvas.height / 2);
    
        const texture = new THREE.Texture(canvas);
        texture.needsUpdate = true;
    
        return texture;
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