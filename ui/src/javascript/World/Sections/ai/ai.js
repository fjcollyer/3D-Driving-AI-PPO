import * as tf from '@tensorflow/tfjs';

export default class AI {
  constructor() {
    console.log("AI constructor")
    this.memory = [];
    this.maxMemorySize = 2000;
    this.actions = ['up', 'right', 'down', 'left', 'brake', 'boost'];
    this.numActions = this.actions.length;
    this.numStateVariables = 8; // the number of variables that describe the state of the game

    this.explorationRate = 1.0;
    this.explorationDecay = 0.995;
    this.minExplorationRate = 0.01;
    
    this.model = this.createModel();
    this.optimizer = tf.train.adam(0.01);
    
  }

  createModel() {
    console.log("AI createModel")
    const model = tf.sequential();
    model.add(tf.layers.dense({inputShape: [this.numStateVariables], units: 128, activation: 'relu'}));
    model.add(tf.layers.dense({units: 64, activation: 'relu'}));
    model.add(tf.layers.dense({units: this.numActions, activation: 'sigmoid'}));
    return model;
  }
  
  remember(state, action, reward, nextState) {
    // console.log("AI remember")
    // console.log("state: " + state)
    // console.log("action: " + action)
    // console.log("reward: " + reward)
    // console.log("nextState: " + nextState)
    if (this.memory.length > this.maxMemorySize) {
      this.memory.shift();
    }
    this.memory.push({state, action, reward, nextState});
  }
  
  chooseAction(state) {
    // console.log("AI chooseAction")
    if (Math.random() < this.explorationRate) {
      return this.actions.reduce((acc, action) => {
        acc[action] = Math.random() > 0.5;
        return acc;
      }, {});
    }
    
    const stateTensor = tf.tensor2d([state], [1, this.numStateVariables]);
    const qValues = this.model.predict(stateTensor).dataSync();
    
    return this.actions.reduce((acc, action, idx) => {
      acc[action] = qValues[idx] > 0.5; 
      return acc;
    }, {});
  }

  async train(batchSize) {
    if (this.memory.length < batchSize) return; // if not enough memories, return early
    //console.log("AI train, enough memories")
    
    const batch = [];
    for (let i = 0; i < batchSize; i++) {
      const idx = Math.floor(Math.random() * this.memory.length);
      batch.push(this.memory[idx]);
    }
    
    await tf.tidy(() => {
      const states = tf.tensor2d(batch.map(mem => mem.state), [batchSize, this.numStateVariables]);
      
      const targets = batch.map(mem => {
        const action = this.actions.map(a => mem.action[a] ? 1 : 0);
        const nextState = tf.tensor2d([mem.nextState], [1, this.numStateVariables]);
        const futureQs = this.model.predict(nextState).dataSync();
        const updatedQs = action.map((flag, i) => flag ? mem.reward + 0.99 * futureQs[i] : futureQs[i]);
        return updatedQs;
      });
      
      const targetTensor = tf.tensor2d(targets, [batchSize, this.numActions]);

      this.optimizer.minimize(() => {
        const predictions = this.model.predict(states);
        return tf.losses.meanSquaredError(targetTensor, predictions);
      });
    });
    
    this.explorationRate *= this.explorationDecay;
    this.explorationRate = Math.max(this.explorationRate, this.minExplorationRate);
  }
}