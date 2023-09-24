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

        this.startTime = Date.now();

        this.time.on('tick', () =>
        {

            if(this.world.physics)
            {
                this.updateTimer()
            }
        })
    }

    updateTimer() {
        if (this.startTime) {
            const elapsedTime = Date.now() - this.startTime; // in milliseconds
            const seconds = Math.floor((elapsedTime / 1000) % 60);
            const minutes = Math.floor((elapsedTime / (1000 * 60)) % 60);
    
            // Update the displayed time
            document.getElementById("lap-timer").innerText = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        }
    }    
}