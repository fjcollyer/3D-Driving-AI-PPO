from flask import Flask, request, jsonify
import numpy as np
from model import ImprovedRLModel
from flask_cors import CORS
import logging

# Flask Setup
app = Flask(__name__)
CORS(app)

action_size = 4
state_size = 4

rl_model = ImprovedRLModel(state_size=state_size, action_size=action_size)
rl_model.start_training()

@app.route('/get_action', methods=['POST'])
def get_action():
    try:
        data = request.json
        current_state = np.array(data['currentState']).reshape(1, -1)
        previous_state = np.array(data.get('previousState', current_state)).reshape(1, -1)
        previous_action = np.array(data.get('previousAiDecision', [False] * action_size)).reshape(1, -1)
        reward = data['reward']
        game_over = data['gameOver']

        rl_model.remember(previous_state, previous_action, reward, current_state, game_over)
        action_list = rl_model.act(current_state)
        action_dict = dict(zip(['up', 'right', 'left', 'boost'], action_list))
        
        return jsonify(action_dict)
    
    except Exception as e:
        logging.error(f"Error occurred: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    try:
        app.run(host='0.0.0.0', port=5001, threaded=True)
    except KeyboardInterrupt:
        logging.info("Gracefully shutting down, saving the model...")
        rl_model.stop_training()
        rl_model.save('./models/my_model')