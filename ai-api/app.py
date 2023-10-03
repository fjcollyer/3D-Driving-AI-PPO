from flask import Flask, request, jsonify
from flask_cors import CORS
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from agent import Agent

app = Flask(__name__)
CORS(app)

n_actions = 3
input_dims = 7
model = Agent(n_actions=n_actions, input_dims=input_dims)

should_train = False
last_state = None
last_action = None
last_policy = None

reward_total = 0
games_played = 0
avg_reward_list = []

CHART_INTERVAL = 1  # Per N times we train
train_count = 0  # Total number of games played

@app.route('/get_action', methods=['POST'])
def get_action():
    global should_train, last_state, last_action, last_policy, reward_total, games_played, train_count

    if should_train:
        return jsonify({"error": "Model is currently training", "should_train": False}), 503

    data = request.json
    observation = np.array(list(data['observation'].values()))
    done = data['done']
    win = data['win']

    action, log_prob, value = model.choose_action(observation)

    if last_state is not None:
        progress_reward = observation[0] - last_state[0]
        reward = progress_reward
        if done:
            reward += 10 if win else -2
        
        reward_total += reward
        model.store_transition(last_state, last_action, last_policy, value, reward, done)

    last_state = observation
    last_action = action
    last_policy = log_prob

    if done:
        games_played += 1
        last_state = last_action = last_policy = None

        if len(model.memory.states) >= (model.memory.batch_size * model.n_epochs * 2): # 10 * 64 * 2 = 1280
            should_train = True
            
            # Logging code
            avg_reward_list.append(reward_total / games_played)  # Log average reward for the batch
            reward_total = 0
            games_played = 0

            train_count += 1
            if train_count % CHART_INTERVAL == 0:  # Every CHART_INTERVAL times trained, plot and save chart.
                plt.plot(avg_reward_list, marker='o')
                plt.xlabel('Times Trained')
                plt.ylabel('Average Reward')
                plt.title('Average Reward per Game for Each Batch')
                plt.savefig(f'./charts/chart_{train_count}.png')
                plt.close()

    action_dict = {
        0: {"left": True, "right": False,},
        1: {"left": False, "right": False,},
        2: {"left": False, "right": True,},
    }.get(action, {"left": False, "right": False,})

    print(len(model.memory.states))
    return jsonify({"action": action_dict, "should_train": should_train})


@app.route('/start_training', methods=['POST'])
def start_training():
    global should_train
    if not should_train:
        return jsonify({"error": "Model is not ready to train"}), 503

    print('Model training...')
    model.learn()  # PPO training
    should_train = False
    print('Model training completed')
    return jsonify({"status": "training_completed"})

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5001)