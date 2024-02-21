import EventEmitter from './EventEmitter.js'

export default class Time extends EventEmitter {
    /**
     * Constructor
     */
    constructor() {
        super()

        this.start = Date.now()
        this.current = this.start
        this.elapsed = 0
        this.delta = 16

        this.firstHunderdDelta = []
        this.averageDelta = null

        this.tick = this.tick.bind(this)
        this.tick()
    }

    /**
     * Tick
     */
    tick() {
        this.ticker = window.requestAnimationFrame(this.tick)

        const current = Date.now()

        this.delta = current - this.current
        this.elapsed = current - this.start

        if (this.firstHunderdDelta.length < 100) {
            this.firstHunderdDelta.push(this.delta)
            if (this.firstHunderdDelta.length > 2) {
                this.averageDelta = this.firstHunderdDelta.reduce((a, b) => a + b, 0) / this.firstHunderdDelta.length
                // console.log('Average delta:', this.averageDelta)
            }
        }

        this.current = current

        if (this.delta > 60) {
            this.delta = 60
        }

        this.trigger('tick')
    }

    /**
     * Stop
     */
    stop() {
        window.cancelAnimationFrame(this.ticker)
    }
}
