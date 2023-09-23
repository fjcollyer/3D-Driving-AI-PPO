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

        // Setup
        this.$container = document.querySelector('.js-threejs-journey')
        this.$messages = [...this.$container.querySelectorAll('.js-message')]
        // this.$yes = this.$container.querySelector('.js-yes')
        // this.$no = this.$container.querySelector('.js-no')
        this.step = 0
        this.maxStep = this.$messages.length - 1
        this.seenCount = window.localStorage.getItem('threejsJourneySeenCount') || 0
        this.seenCount = parseInt(this.seenCount)
        this.shown = false
        this.traveledDistance = 0
        this.minTraveledDistance = (this.config.debug ? 5 : 75) * (this.seenCount + 1)
        this.prevent = !!window.localStorage.getItem('threejsJourneyPrevent')
        this.startTime = Date.now();

        if(this.config.debug)
            this.start()
        
        if(this.prevent)
            return

        // this.setYesNo()
        // this.setLog()

        this.time.on('tick', () =>
        {

            if(this.world.physics)
            {
                this.traveledDistance += this.world.physics.car.forwardSpeed

                this.start()
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

    hide()
    {
        for(const _$message of this.$messages)
        {
            _$message.classList.remove('is-visible')
        }

        TweenLite.delayedCall(0.5, () =>
        {
            this.$container.classList.remove('is-active')
        })
    }

    start() {
        this.$container.classList.add('is-active');
        this.updateTimer(); // Initialize the timer
    
        window.requestAnimationFrame(() => {
            this.next();
    
            TweenLite.delayedCall(4, () => {
                this.next();
            });
            TweenLite.delayedCall(7, () => {
                this.next();
            });
        });
    }    

    updateMessages()
    {
        let i = 0

        // Visibility
        for(const _$message of this.$messages)
        {
            if(i < this.step)
                _$message.classList.add('is-visible')

            i++
        }

        // Position
        this.$messages.reverse()

        let height = 0
        i = this.maxStep
        for(const _$message of this.$messages)
        {
            const messageHeight = _$message.offsetHeight
            if(i < this.step)
            {
                _$message.style.transform = `translateY(${- height}px)`
                height += messageHeight + 20
            }
            else
            {
                _$message.style.transform = `translateY(${messageHeight}px)`
            }

            i--
        }


        this.$messages.reverse()
    }

    next()
    {
        if(this.step > this.maxStep)
            return

        this.step++

        this.updateMessages()
    }
}