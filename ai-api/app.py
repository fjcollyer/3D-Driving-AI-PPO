from flask import Flask, request, jsonify
from dqn_agent import DQNAgent
import numpy as np
from flask_cors import CORS
import matplotlib.pyplot as plt
plt.switch_backend('Agg')

app = Flask(__name__)
CORS(app)

action_space = 3
state_space = 7
model = DQNAgent(action_space, state_space)

# Struct to keep track of agent-specific data
agent_data = {}
is_training = False

"""Logging code"""""
plot_frequency = 40
total_completed_games = 0 # Never reset
avarages_array = [] # Array of tuples (avg_reward, avg_percentage)
completed_games = 0 # Reset after every time we log statistics
total_percentage_completed = 0 # Reset after every time we log statistics
total_reward = 0 # Reset after every time we log statistics
"""End of logging code"""

@app.route('/get_action', methods=['POST'])
def get_action():
    global should_train, completed_games, total_percentage_completed, total_reward, total_completed_games, plot_frequency

    data = request.json
    agent_id = data['agent_id']
    observation = np.array(list(data['observation'].values()))
    done = data['done']
    win = data['win']

    # Initialize agent's data if not existing
    if agent_id not in agent_data:
        agent_data[agent_id] = {
            "last_state": None,
            "last_action": None,
            "paused": False
        }

    current_agent = agent_data[agent_id]

    # Store training data from previous observation/action as we now have the new observation
    if current_agent["last_state"] is not None:
        reward = calculateReward(current_agent["last_state"], observation, done, win)
        model.store_data(current_agent["last_state"], current_agent["last_action"], observation, reward, done)

        """Logging code"""
        total_reward += reward
        """End of logging code"""

    # Decide on next action
    action = model.get_action(observation)

    # Update agent's data
    current_agent["last_state"] = observation
    current_agent["last_action"] = action

    # Decide whether to pause the agent or continue with next action
    if done:
        should_train = True

        """Logging code"""
        total_completed_games += 1
        completed_games += 1
        total_percentage_completed += observation[0] * 100 # Accounting for normalization of the percentage
        """End of logging code"""

        # Reset agent's data
        current_agent["last_state"] = None
        current_agent["last_action"] = None
        # Notify agent to pause.
        current_agent["paused"] = True
        return jsonify({"action": get_action_dict(action), "pause": True})
    else:
        return jsonify({"action": get_action_dict(action), "pause": False})

@app.route('/check_unpause', methods=['GET'])
def check_unpause():
    global is_training, completed_games
    agent_id = request.args.get('agent_id')

    # If all agents are paused and training is not ongoing, start training
    if all([data["paused"] for data in agent_data.values()]) and not is_training:
        is_training = True
        print("Training started")

        """Logging code"""
        print("Completed games in loggin batch: ", completed_games)
        if completed_games >= plot_frequency:
            plot_statistics()
        """End of logging code"""

        # Functionality
        model.learn()
        for data in agent_data.values():
            data["paused"] = False
        is_training = False

        print("Training finished")
        return jsonify({"unpause": True})

    if agent_id in agent_data and not agent_data[agent_id]["paused"]:
        return jsonify({"unpause": True})

    return jsonify({"unpause": False})

""" Utility functions """
def calculateReward(last_state, observation, done, win):
    if win:
        return 10
    if done and not win:
        return -2
    # This is the difference in the % of the game completed
    return (observation[0] - last_state[0]) * 100 # Accounting for normalization

# Utility function to convert action index to action dictionary.
def get_action_dict(action_index):
    action_mappings = {
        0: {"left": True, "right": False,},
        1: {"left": False, "right": False,},
        2: {"left": False, "right": True,},
    }
    return action_mappings[action_index]

"""Logging code"""
# Plot statistics and save to ./statistics.png
def plot_statistics():
    global avarages_array, completed_games, total_percentage_completed, total_reward
    print("Plotting statistics")

    # Calculate averages for the current batch of games
    avg_reward = total_reward / completed_games
    avg_percentage = total_percentage_completed / completed_games

    # Append averages to the array
    avarages_array.append((avg_reward, avg_percentage))

    # Reset counters for the next batch
    completed_games = 0
    total_percentage_completed = 0
    total_reward = 0

    # Extract data for plotting
    rewards, percentages = zip(*avarages_array)
    games = [i * plot_frequency for i in range(1, len(avarages_array) + 1)]

    # Create the plot
    fig, ax1 = plt.subplots()

    color = 'tab:red'
    ax1.set_xlabel('Total Completed Games')
    ax1.set_ylabel('Average Reward', color=color)
    ax1.plot(games, rewards, color=color)
    ax1.tick_params(axis='y', labelcolor=color)

    ax2 = ax1.twinx()
    color = 'tab:blue'
    ax2.set_ylabel('Average % Completed', color=color)
    ax2.plot(games, percentages, color=color)
    ax2.tick_params(axis='y', labelcolor=color)

    fig.tight_layout()
    plt.savefig('./statistics.png')
    plt.close()
"""End of logging code"""

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5001)