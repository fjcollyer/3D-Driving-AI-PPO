class AI {
  constructor() {
    console.log("AI constructor")
    this.actions = {}
    this.actions.up = false
    this.actions.right = false
    this.actions.down = false
    this.actions.left = false
    this.actions.brake = false
    this.actions.boost = false
  }

  // For each possible move randomly decide if we should do it or not
  returnRandomDecision(state) {
    const decision = {}
    for (const action in this.actions) {
      decision[action] = Math.random() > 0.5
    }
    return decision;
  }
}

export default AI;