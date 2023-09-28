from flask import Flask, request, jsonify
from flask_cors import CORS
import numpy as np
import logging
from model import RLModel
import atexit  # Import the atexit module

app = Flask(__name__)
CORS(app)

# Set the level of loggers to ERROR
app.logger.setLevel(logging.ERROR)
log = logging.getLogger('werkzeug')
log.setLevel(logging.ERROR)

rl_model = RLModel(state_size=8, action_size=6)
rl_model.start_training()

def graceful_exit():  # Function to be executed on exit
    logging.info("Shutting down the API, saving the model, and stopping the training thread...")
    rl_model.stop_training()
    rl_model.save('./models/my_model')
    logging.info("Shutdown complete.")

atexit.register(graceful_exit)  # Register the function to be called on exit

@app.route('/get_action', methods=['POST'])
def get_action():
    try:
        data = request.json
        current_state = np.array(data['currentState']).reshape(1, -1)
        previous_state = np.array(data.get('previousState', current_state)).reshape(1, -1)
        previous_action = np.array(data.get('previousAiDecision', [False] * 6)).reshape(1, -1)
        reward = data['reward']
        game_over = data['gameOver']
        
        rl_model.remember(previous_state, previous_action, reward, current_state, game_over)
        
        action_list = rl_model.act(current_state)
        action_dict = dict(zip(['up', 'right', 'down', 'left', 'brake', 'boost'], action_list))
        
        return jsonify(action_dict)
    
    except Exception as e:
        logging.error(f"Error occurred: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    try:
        app.run(host='0.0.0.0', port=5001, threaded=True)
    except KeyboardInterrupt:
        print("Gracefully shutting down...")