const fjcConfig = require('../fjcConfig.js');
import startImg from '../../images/clock.png';

import * as THREE from 'three'
import Materials from './Materials.js'
import Floor from './Floor.js'
import Shadows from './Shadows.js'
import Physics from './Physics.js'
import Zones from './Zones.js'
import Objects from './Objects.js'
import Car from './Car.js'
import Areas from './Areas.js'
import Tiles from './Tiles.js'
import Walls from './Walls.js'
import IntroSection from './Sections/IntroSection.js'
import ProjectsSection from './Sections/ProjectsSection.js'
import CrossroadsSection from './Sections/CrossroadsSection.js'
import InformationSection from './Sections/InformationSection.js'
import PlaygroundSection from './Sections/PlaygroundSection.js'
// import DistinctionASection from './Sections/DistinctionASection.js'
// import DistinctionBSection from './Sections/DistinctionBSection.js'
// import DistinctionCSection from './Sections/DistinctionCSection.js'
// import DistinctionDSection from './Sections/DistinctionDSection.js'
import Controls from './Controls.js'
import Sounds from './Sounds.js'
import { TweenLite } from 'gsap/TweenLite.js'
import { Power2 } from 'gsap/EasePack.js'
import EasterEggs from './EasterEggs.js'

export default class
{
    constructor(_options)
    {
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
        if(this.debug)
        {
            this.debugFolder = this.debug.addFolder('world')
            this.debugFolder.open()
        }

        // Set up
        this.container = new THREE.Object3D()
        this.container.matrixAutoUpdate = false

        // this.setAxes()
        this.setSounds()
        this.setControls()
        this.setFloor()
        this.setAreas()
        this.setStartingScreen()
    }

    start()
    {
        window.setTimeout(() =>
        {
            this.camera.pan.enable()
            
        }, 2000)

        this.setReveal()
        this.setMaterials()
        this.setShadows()
        this.setPhysics()
        this.setZones()
        this.setObjects()
        console.log("setting car in start")
        this.setCar()
        this.areas.car = this.car
        this.setTiles()
        this.setWalls()
        this.setSections()
        //this.setEasterEggs()
    }

    setReveal()
    {
        this.reveal = {}
        this.reveal.matcapsProgress = 0
        this.reveal.floorShadowsProgress = 0
        this.reveal.previousMatcapsProgress = null
        this.reveal.previousFloorShadowsProgress = null

        // Go method
        this.reveal.go = () =>
        {
            console.log("reveal.go")
            TweenLite.fromTo(this.reveal, 3, { matcapsProgress: 0 }, { matcapsProgress: 1 })
            TweenLite.fromTo(this.reveal, 3, { floorShadowsProgress: 0 }, { floorShadowsProgress: 1, delay: 0.5 })
            TweenLite.fromTo(this.shadows, 3, { alpha: 0 }, { alpha: 0.5, delay: 0.5 })

            if(this.sections.intro)
            {
                TweenLite.fromTo(this.sections.intro.instructions.arrows.label.material, 0.3, { opacity: 0 }, { opacity: 1, delay: 0.5 })
                if(this.sections.intro.otherInstructions)
                {
                    TweenLite.fromTo(this.sections.intro.otherInstructions.label.material, 0.3, { opacity: 0 }, { opacity: 1, delay: 0.75 })
                }
            }

            // Car
            this.physics.car.chassis.body.sleep()
            //this.physics.car.chassis.body.position.set(fjcConfig.carStartingPosition[0], fjcConfig.carStartingPosition[1], fjcConfig.carStartingPosition[2])

            window.setTimeout(() =>
            {
                this.physics.car.chassis.body.wakeUp()
            }, 300)

            // Sound
            TweenLite.fromTo(this.sounds.engine.volume, 0.5, { master: 0 }, { master: 0.7, delay: 0.3, ease: Power2.easeIn })
            window.setTimeout(() =>
            {
                this.sounds.play('reveal')
            }, 400)

            // Controls
            if(this.controls.touch)
            {
                window.setTimeout(() =>
                {
                    this.controls.touch.reveal()
                }, 400)
            }
        }

        // Time tick
        this.time.on('tick',() =>
        {
            // Matcap progress changed
            if(this.reveal.matcapsProgress !== this.reveal.previousMatcapsProgress)
            {
                // Update each material
                for(const _materialKey in this.materials.shades.items)
                {
                    const material = this.materials.shades.items[_materialKey]
                    material.uniforms.uRevealProgress.value = this.reveal.matcapsProgress
                }

                // Save
                this.reveal.previousMatcapsProgress = this.reveal.matcapsProgress
            }

            // Matcap progress changed
            if(this.reveal.floorShadowsProgress !== this.reveal.previousFloorShadowsProgress)
            {
                // Update each floor shadow
                for(const _mesh of this.objects.floorShadows)
                {
                    _mesh.material.uniforms.uAlpha.value = this.reveal.floorShadowsProgress
                }

                // Save
                this.reveal.previousFloorShadowsProgress = this.reveal.floorShadowsProgress
            }
        })

        // Debug
        if(this.debug)
        {
            this.debugFolder.add(this.reveal, 'matcapsProgress').step(0.0001).min(0).max(1).name('matcapsProgress')
            this.debugFolder.add(this.reveal, 'floorShadowsProgress').step(0.0001).min(0).max(1).name('floorShadowsProgress')
            this.debugFolder.add(this.reveal, 'go').name('reveal')
        }
    }
    
    setStartingScreen() {
    
        const loaderContainer = document.createElement('div');
        loaderContainer.className = 'loader-container';
        loaderContainer.innerHTML = `<button id="loader-startButton">0%</button>`;
        
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
            }
            
            #loader-startButton {
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
                opacity: 0;
                transition: opacity .3s ease-in-out;
                border-radius: 10px;
            }
            
            #loader-startButton:active {
                scale: 0.9;
            }
            
            #loader-startButton:active:after {
                background: transparent;
            }
            
            #loader-startButton:hover:before {
                opacity: 1;
            }
            
            #loader-startButton:after {
                z-index: -1;
                content: '';
                position: absolute;
                width: 100%;
                height: 100%;
                background: #111;
                left: 0;
                top: 0;
                border-radius: 10px;
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
        // Handling the loading progress
        this.resources.on('progress', (_progress) => {
            _progress = Math.floor(_progress * 100);
            document.querySelector('#loader-startButton').textContent = _progress >= 100 ? `START` : `${_progress}%`;
            progress = _progress;
        });
        
        document.getElementById('loader-startButton').addEventListener('click', () => {
            if (progress < 100) {
                console.log('Not loaded yet');
                return;
            }
            loaderContainer.classList.add('fade-out');
            setTimeout(() => {
                document.body.removeChild(loaderContainer);
                document.head.removeChild(style);
                this.start();
                this.reveal.go();
            }, 500);
        });
    }    
    
          

    setSounds()
    {
        this.sounds = new Sounds({
            debug: this.debugFolder,
            time: this.time
        })
    }

    setAxes()
    {
        this.axis = new THREE.AxesHelper()
        this.container.add(this.axis)
    }

    setControls()
    {
        this.controls = new Controls({
            config: this.config,
            sizes: this.sizes,
            time: this.time,
            camera: this.camera,
            sounds: this.sounds
        })
    }

    setMaterials()
    {
        this.materials = new Materials({
            resources: this.resources,
            debug: this.debugFolder
        })
    }

    setFloor()
    {
        this.floor = new Floor({
            debug: this.debugFolder
        })

        this.container.add(this.floor.container)
    }

    setShadows()
    {
        this.shadows = new Shadows({
            time: this.time,
            debug: this.debugFolder,
            renderer: this.renderer,
            camera: this.camera
        })
        this.container.add(this.shadows.container)
    }

    setPhysics()
    {
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

    setZones()
    {
        this.zones = new Zones({
            time: this.time,
            physics: this.physics,
            debug: this.debugFolder
        })
        this.container.add(this.zones.container)
    }

    setAreas()
    {
        this.areas = new Areas({
            config: this.config,
            resources: this.resources,
            debug: this.debug,
            renderer: this.renderer,
            camera: this.camera,
            car: this.car,
            sounds: this.sounds,
            time: this.time
        })

        this.container.add(this.areas.container)
    }

    setTiles()
    {
        this.tiles = new Tiles({
            resources: this.resources,
            objects: this.objects,
            debug: this.debug
        })
    }

    setWalls()
    {
        this.walls = new Walls({
            resources: this.resources,
            objects: this.objects
        })
    }

    setObjects()
    {
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

    setCar()
    {
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

    setSections()
    {
        this.sections = {}

        // Generic options
        const options = {
            config: this.config,
            time: this.time,
            resources: this.resources,
            camera: this.camera,
            passes: this.passes,
            objects: this.objects,
            areas: this.areas,
            zones: this.zones,
            walls: this.walls,
            tiles: this.tiles,
            debug: this.debugFolder
        }

        // // Distinction A
        // this.sections.distinctionA = new DistinctionASection({
        //     ...options,
        //     x: 0,
        //     y: - 15
        // })
        // this.container.add(this.sections.distinctionA.container)

        // // Distinction B
        // this.sections.distinctionB = new DistinctionBSection({
        //     ...options,
        //     x: 0,
        //     y: - 15
        // })
        // this.container.add(this.sections.distinctionB.container)

        // // Distinction C
        // this.sections.distinctionC = new DistinctionCSection({
        //     ...options,
        //     x: 0,
        //     y: 0
        // })
        // this.container.add(this.sections.distinctionC.container)

        // Distinction D
        // this.sections.distinctionD = new DistinctionDSection({
        //     ...options,
        //     x: 0,
        //     y: 0
        // })
        // this.container.add(this.sections.distinctionD.container)

        // Intro
        // this.sections.intro = new IntroSection({
        //     ...options,
        //     x: 0,
        //     y: 0
        // })
        // this.container.add(this.sections.intro.container)

        // Crossroads
        // this.sections.crossroads = new CrossroadsSection({
        //     ...options,
        //     x: 0,
        //     y: - 30
        // })
        // this.container.add(this.sections.crossroads.container)

        // Projects
        // this.sections.projects = new ProjectsSection({
        //     ...options,
        //     x: 30,
        //     y: - 30
        //     // x: 0,
        //     // y: 0
        // })
        // this.container.add(this.sections.projects.container)

        // // Information
        // this.sections.information = new InformationSection({
        //     ...options,
        //     x: 1.2,
        //     y: - 55
        //     // x: 0,
        //     // y: - 10
        // })
        // this.container.add(this.sections.information.container)

        // Playground
            this.sections.playground = new PlaygroundSection({
                ...options,
                x: 0,
                y: 0
                // x: - 15,
                // y: - 4
            })
            this.container.add(this.sections.playground.container)
        }
    

    setEasterEggs()
    {
        // this.easterEggs = new EasterEggs({
        //     resources: this.resources,
        //     car: this.car,
        //     walls: this.walls,
        //     objects: this.objects,
        //     materials: this.materials,
        //     areas: this.areas,
        //     config: this.config,
        //     physics: this.physics
        // })
        // this.container.add(this.easterEggs.container)
    }
}
