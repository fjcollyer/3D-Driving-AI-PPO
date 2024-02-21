import * as tf from '@tensorflow/tfjs';

class PPOAgent {
  constructor(path_to_tfjs_actor, path_to_tfjs_critic, actions_list, action_mappings, state_space) {
    this.path_to_tfjs_actor = path_to_tfjs_actor + '/model.json';
    this.path_to_tfjs_critic = path_to_tfjs_critic + '/model.json';
    this.actions_list = actions_list;
    this.action_mappings = action_mappings;
    this.state_space = state_space;

    this.loadModels();
  }

  async loadModels() {
    this.actorModel = await tf.loadGraphModel(this.path_to_tfjs_actor);
    this.criticModel = await tf.loadGraphModel(this.path_to_tfjs_critic);
    console.log('Actor and critic models loaded');
    console.log(this.actorModel);
    console.log(this.criticModel);
  }

  async chooseAction(stateObject) {
    const stateArray = Object.values(stateObject);

    // Create a tensor from the state array
    const n = this.state_space;
    if (stateArray.length != n) {
      console.log("Error: stateArray.length != n (this.state_space)");
      console.log("stateArray.length = " + stateArray.length);
      console.log("n = " + n);
    }
    const stateTensor = tf.tensor2d([stateArray], [1, n]); // Shape is [1, n]

    // Predict action probabilities and value
    const pi = this.actorModel.predict(stateTensor);
    const actionProbabilities = await pi.data();
    const action = this.sampleAction(actionProbabilities);
    const value = this.criticModel.predict(stateTensor);
    const valueData = await value.data();

    // Clean up tensor to prevent memory leak
    tf.dispose(stateTensor);

    // Log the path to the model
    // console.log("path_to_tfjs_actor: " + this.path_to_tfjs_actor);

    return { action, actionProbabilities, value: valueData[0] };
  }

  sampleAction(probabilities) {
    let sum = probabilities.reduce((a, b) => a + b, 0);
    let acc = 0;
    let r = Math.random() * sum;
    for (let i = 0; i < probabilities.length; i++) {
      acc += probabilities[i];
      if (r <= acc) {
        return i;
      }
    }
    return probabilities.length - 1; // Return last index in case of rounding errors
  }

  getActionDict(actionIndex) {

    // Default action dictionary
    const actionDict = {};
    for (const action of this.actions_list) {
      actionDict[action] = false;
    }

    // Update actionDict based on the actionIndex
    if (this.action_mappings[actionIndex]) {
      for (const key in this.action_mappings[actionIndex]) {
        actionDict[key] = this.action_mappings[actionIndex][key];
      }
    }

    return actionDict;
  }
}

export default PPOAgent;