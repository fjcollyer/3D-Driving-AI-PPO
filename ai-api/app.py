import time
from flask import Flask, request, jsonify
from flask_cors import CORS
import numpy as np
from model import RLModel

app = Flask(__name__)
CORS(app)

model = RLModel()

should_train = False
last_state = None
last_action = None
last_policy = None


@app.route('/get_action', methods=['POST'])
def get_action():
    global should_train, last_state, last_action, last_policy
    
    if should_train:
        return jsonify({"error": "Model is currently training", "should_train": False}), 503  # Service Unavailable

    data = request.json
    observation = np.array(list(data['observation'].values()))
    done = data['done']
    win = data['win']
    
    action, policy = model.compute_action(observation)
    
    # Compute reward
    if last_state is not None:
        progress_reward = observation[0] - last_state[0]
        if done and win:
            reward = 10
        elif done and not win:
            reward = -10
        else:
            progress_reward = observation[0] - last_state[0]
            reward = progress_reward
        model.store_transition(last_state, last_action, reward, observation, done, last_policy)
    
    last_state = observation
    last_action = action
    last_policy = policy
    
    if done:
        last_state = last_action = last_policy = None
        if len(model.memory) >= model.transitions_to_train:
            should_train = True
    
    action_dict = model.action_dict(action)
    
    print(len(model.memory))

    return jsonify({"action": action_dict, "should_train": should_train})


@app.route('/start_training', methods=['POST'])
def start_training():
    global should_train
    if not should_train:
        return jsonify({"error": "Model is not ready to train"}), 503  # Service Unavailable
    
    print('Model training...')
    model.train()
    should_train = False  # Reset the flag after training
    print('Model training completed')
    return jsonify({"status": "training_completed"})


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5001)