const fjcConfig = require('../fjcConfig.js');
import startImg from '../../images/clock.png';

import * as THREE from 'three'
import Materials from './Materials.js'
import Shadows from './Shadows.js'
import Physics from './Physics.js'
import Objects from './Objects.js'
import Car from './Car.js'
import Controls from './Controls.js'
import Sounds from './Sounds.js'
import { TweenLite } from 'gsap/TweenLite.js'
import { Power2 } from 'gsap/EasePack.js'

import Racetrack from './Sections/Racetrack.js'

export default class {
    constructor(_options) {
        console.log("index constructor")
        // Options
        this.config = _options.config
        this.debug = _options.debug
        this.resources = _options.resources
        this.time = _options.time
        this.sizes = _options.sizes
        this.camera = _options.camera
        this.renderer = _options.renderer
        this.passes = _options.passes

        // Debug
        if (this.debug) {
            this.debugFolder = this.debug.addFolder('world')
            this.debugFolder.open()
        }

        // Set up
        this.container = new THREE.Object3D()
        this.container.matrixAutoUpdate = false

        // this.setAxes()
        this.setSounds()
        this.setControls()
        this.setStartingScreen()
    }

    start() {
        // window.setTimeout(() => {
        //     this.camera.pan.enable()

        // }, 500)

        this.setReveal()
        this.setMaterials()
        this.setShadows()
        this.setPhysics()
        this.setObjects()
        console.log("setting car in start")
        this.setCar()
        this.setSections()
        //this.setEasterEggs()
    }

    setReveal() {
        this.reveal = {}
        this.reveal.matcapsProgress = 0
        this.reveal.floorShadowsProgress = 0
        this.reveal.previousMatcapsProgress = null
        this.reveal.previousFloorShadowsProgress = null

        // Go method
        this.reveal.go = () => {
            console.log("reveal.go")
            TweenLite.fromTo(this.reveal, 3, { matcapsProgress: 0 }, { matcapsProgress: 1 })
            TweenLite.fromTo(this.reveal, 3, { floorShadowsProgress: 0 }, { floorShadowsProgress: 1, delay: 0.5 })
            TweenLite.fromTo(this.shadows, 3, { alpha: 0 }, { alpha: 0.5, delay: 0.5 })

            if (this.sections.intro) {
                TweenLite.fromTo(this.sections.intro.instructions.arrows.label.material, 0.3, { opacity: 0 }, { opacity: 1, delay: 0.5 })
                if (this.sections.intro.otherInstructions) {
                    TweenLite.fromTo(this.sections.intro.otherInstructions.label.material, 0.3, { opacity: 0 }, { opacity: 1, delay: 0.75 })
                }
            }

            // Car
            this.physics.car.chassis.body.wakeUp()
            //this.physics.car.chassis.body.position.set(fjcConfig.carStartingPosition[0], fjcConfig.carStartingPosition[1], fjcConfig.carStartingPosition[2])

            // Sound
            TweenLite.fromTo(this.sounds.engine.volume, 0.5, { master: 0 }, { master: 0.7, delay: 0.3, ease: Power2.easeIn })
            window.setTimeout(() => {
                this.sounds.play('reveal')
            }, 400)

            // Controls
            if (this.controls.touch) {
                window.setTimeout(() => {
                    this.controls.touch.reveal()
                }, 400)
            }
        }

        // Time tick
        this.time.on('tick', () => {
            // Instantly set progress to 100% on first tick
            this.reveal.matcapsProgress = 1; // Assuming 1 is 100%
            this.reveal.floorShadowsProgress = 1; // Assuming 1 is 100%

            // Update each material to reflect new matcaps progress
            for (const _materialKey in this.materials.shades.items) {
                const material = this.materials.shades.items[_materialKey];
                material.uniforms.uRevealProgress.value = this.reveal.matcapsProgress;
            }
            // Save the new matcaps progress
            this.reveal.previousMatcapsProgress = this.reveal.matcapsProgress;

            // Update each floor shadow to reflect new floor shadows progress
            for (const _mesh of this.objects.floorShadows) {
                _mesh.material.uniforms.uAlpha.value = this.reveal.floorShadowsProgress;
            }
            // Save the new floor shadows progress
            this.reveal.previousFloorShadowsProgress = this.reveal.floorShadowsProgress;
        });


        // Debug
        if (this.debug) {
            this.debugFolder.add(this.reveal, 'matcapsProgress').step(0.0001).min(0).max(1).name('matcapsProgress')
            this.debugFolder.add(this.reveal, 'floorShadowsProgress').step(0.0001).min(0).max(1).name('floorShadowsProgress')
            this.debugFolder.add(this.reveal, 'go').name('reveal')
        }
    }

    setStartingScreen() {

        const backgroundDiv = document.createElement('div');
        backgroundDiv.style.position = 'fixed';
        backgroundDiv.style.top = '0';
        backgroundDiv.style.left = '0';
        backgroundDiv.style.width = '100%';
        backgroundDiv.style.height = '100%';
        backgroundDiv.style.backgroundColor = 'black';
        backgroundDiv.style.zIndex = '1000';
        backgroundDiv.style.opacity = '1';
        backgroundDiv.style.transition = 'opacity 0.5s ease-in-out';
        document.body.appendChild(backgroundDiv);

        const loaderContainer = document.createElement('div');
        loaderContainer.className = 'loader-container';
        loaderContainer.innerHTML = `
        <button id="loader-startButton">
            <div id="loader-background"></div>
            0%
        </button>`;

        document.body.appendChild(loaderContainer);

        const style = document.createElement('style');
        style.innerHTML = `
            .loader-container {
                position: fixed;
                top: calc(50% - 25px);
                left: calc(50% - 75px);
                width: 150px;
                height: 50px;
                display: flex;
                justify-content: center;
                align-items: center;
                z-index: 1001;
            }
            
            #loader-startButton {
                transition: transform 0.1s ease-in-out;
                width: 100%;
                height: 100%;
                border: none;
                outline: none;
                color: white;
                font-weight: 700;
                font-size: 14px;
                letter-spacing: 1px;
                background: #111;
                cursor: pointer;
                border-radius: 10px;
                text-align: center;
                line-height: 50px;
            }
            
            #loader-startButton:before {
                content: '';
                background: linear-gradient(45deg, #ff0000, #ff7300, #fffb00, #48ff00, #00ffd5, #002bff, #7a00ff, #ff00c8, #ff0000);
                position: absolute;
                top: -2px;
                left:-2px;
                background-size: 400%;
                z-index: -1;
                filter: blur(5px);
                width: calc(100% + 4px);
                height: calc(100% + 4px);
                animation: glowing 20s linear infinite;
                opacity: var(--before-opacity, 0);
                transition: opacity .3s ease-in-out;
                border-radius: 10px;
            }

            #loader-startButton:active {
                transform: scale(0.9);
            }

            #loader-startButton.loaded:hover {
                z-index: 1;
            }
            
            #loader-startButton.loaded:before {
                opacity: 1; // This will make the outline glow when it's fully loaded.
            }
            
            #loader-startButton:hover:before {
                opacity: 1; // This will make the outline glow when it's hovered over.
            }
            
            #loader-startButton:active:before {
                opacity: 1; // This will make the outline glow when it's clicked.
            }
            
            @keyframes glowing {
                0% { background-position: 0 0; }
                50% { background-position: 400% 0; }
                100% { background-position: 0 0; }
            }
            
            .fade-out {
                opacity: 0 !important;
                transition: opacity 0.5s ease-in-out;
            }
            
        `;

        document.head.appendChild(style);

        let progress = 0;
        let started = false;
        // Handling the loading progress
        this.resources.on('progress', (_progress) => {
            _progress = Math.floor(_progress * 100);
            const button = document.querySelector('#loader-startButton');
            button.textContent = _progress >= 100 ? `START` : `${_progress}%`;
            progress = _progress;
            if (_progress >= 100) {
                if (started) return;
                button.classList.add('loaded');
            }
        });

        const startButton = document.getElementById('loader-startButton');
        startButton.addEventListener('click', () => {
            if (progress < 100) {
                console.log('Not loaded yet');
                return;
            }

            loaderContainer.classList.add('fade-out');

            // Remove loading button and fade out the loader
            setTimeout(() => {
                document.body.removeChild(loaderContainer);
                document.head.removeChild(style);

                backgroundDiv.style.opacity = '0';
                // Remove the background
                setTimeout(() => {
                    document.body.removeChild(backgroundDiv);
                }, 500);
            }, 500); // Match this with the fade-out duration.

            // Start the game
            setTimeout(() => {
                this.start();
                this.reveal.go();
            }, 100);
        });

    }



    setSounds() {
        this.sounds = new Sounds({
            debug: this.debugFolder,
            time: this.time
        })
    }

    setAxes() {
        this.axis = new THREE.AxesHelper()
        this.container.add(this.axis)
    }

    setControls() {
        this.controls = new Controls({
            config: this.config,
            sizes: this.sizes,
            time: this.time,
            camera: this.camera,
            sounds: this.sounds
        })
    }

    setMaterials() {
        this.materials = new Materials({
            resources: this.resources,
            debug: this.debugFolder
        })
    }

    setShadows() {
        this.shadows = new Shadows({
            time: this.time,
            debug: this.debugFolder,
            renderer: this.renderer,
            camera: this.camera
        })
        this.container.add(this.shadows.container)
    }

    setPhysics() {
        this.physics = new Physics({
            config: this.config,
            debug: this.debug,
            time: this.time,
            sizes: this.sizes,
            controls: this.controls,
            sounds: this.sounds
        })

        this.container.add(this.physics.models.container)
    }

    setObjects() {
        this.objects = new Objects({
            time: this.time,
            resources: this.resources,
            materials: this.materials,
            physics: this.physics,
            shadows: this.shadows,
            sounds: this.sounds,
            debug: this.debugFolder
        })
        this.container.add(this.objects.container)

        // window.requestAnimationFrame(() =>
        // {
        //     this.objects.merge.update()
        // })
    }

    setCar() {
        this.car = new Car({
            time: this.time,
            resources: this.resources,
            objects: this.objects,
            physics: this.physics,
            shadows: this.shadows,
            materials: this.materials,
            controls: this.controls,
            sounds: this.sounds,
            renderer: this.renderer,
            camera: this.camera,
            debug: this.debugFolder,
            config: this.config
        })
        this.container.add(this.car.container)
    }

    setSections() {
        this.sections = {}

        // Generic options
        const options = {
            renderer: this.renderer,
            config: this.config,
            physics: this.physics,
            time: this.time,
            resources: this.resources,
            camera: this.camera,
            passes: this.passes,
            objects: this.objects,
            debug: this.debugFolder
        }

        // Racetrack
        this.sections.racetrack = new Racetrack({
            ...options,
            x: 0,
            y: 0
        })
        this.container.add(this.sections.racetrack.container)
    }
}
