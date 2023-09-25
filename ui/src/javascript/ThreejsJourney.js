const fjcConfig = require('./fjcConfig.js');

import { TweenLite } from 'gsap/TweenLite'

export default class ThreejsJourney
{
    constructor(_options)
    {
        console.log("ThreejsJourney constructor")
        // Options
        this.config = _options.config
        this.time = _options.time
        this.world = _options.world

        this.startTime = Date.now()
        this.checkpointsPassed = [];

        this.time.on('tick', () =>
        {

            if(this.world.physics)
            {

                // Unhide the HTML elements if they are hidden
                if (document.querySelector('.fjc-threejs-journey').hasAttribute('hidden')) {
                    setTimeout(() => {
                        document.querySelector('.fjc-threejs-journey').removeAttribute('hidden');
                        document.querySelector('.threejs-journey.js-threejs-journey').removeAttribute('hidden');
                    } , 300);
                }
                
                //this.updateTimerAndCheckpoints()
            }
        })
    }

    updateTimerAndCheckpoints() {
        if (this.startTime) {
            // Calculate the elapsed time
            const elapsedTime = Date.now() - this.startTime;
            const seconds = Math.floor((elapsedTime / 1000) % 60);
            const minutes = Math.floor((elapsedTime / (1000 * 60)) % 60);

            // Calculate the number of checkpoints passeds vs total checkpoints
            const checkpointCount = this.checkpointsPassed.length;
            const totalCheckpoints = fjcConfig.numberOfCheckpoints;

            // Update the displayed time and checkpoint count
            document.getElementById("checkpoint-count").innerText = `Checkpoints: ${checkpointCount}/${totalCheckpoints}`;
            document.getElementById("lap-timer").innerText = `Time: ${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        }
    }    
}