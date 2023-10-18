from flask import Flask, request, jsonify
import numpy as np
from flask_cors import CORS
import matplotlib.pyplot as plt
from ppo_torch import Agent  # Importing the PPO Agent
plt.switch_backend('Agg')

app = Flask(__name__)
CORS(app)

action_space = 3  # Adjusted to fit the 3 action space
state_space = 12
model = Agent(n_actions=action_space, input_dims=[state_space])  # Initialize the PPO agent

# Struct to keep track of agent-specific data
agent_data = {}
is_training = False

"""Logging code"""
plot_frequency = 100
total_completed_games = 0
averages_array = []
completed_games = 0
total_percentage_completed = 0
total_reward = 0
"""End of logging code"""

@app.route('/get_action', methods=['POST'])
def get_action():
    global completed_games, total_percentage_completed, total_reward, total_completed_games

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

    # Store training data from previous observation/action
    if current_agent["last_state"] is not None:
        reward = calculateReward(current_agent["last_state"], observation, done, win)
        model.remember(current_agent["last_state"], current_agent["last_action"], 
                       current_agent["last_probs"], current_agent["last_value"], 
                       reward, done)

        """Logging code"""
        total_reward += reward
        """End of logging code"""

    # Decide on next action
    action, probs, value = model.choose_action(observation)

    # Update agent's data
    current_agent["last_state"] = observation
    current_agent["last_action"] = action
    current_agent["last_probs"] = probs
    current_agent["last_value"] = value

    # Decide whether to pause the agent or continue with next action
    if done:
        """Logging code"""
        total_completed_games += 1
        completed_games += 1
        total_percentage_completed += observation[0] * 100
        """End of logging code"""

        # Reset agent's data
        current_agent["last_state"] = None
        current_agent["last_action"] = None
        current_agent["paused"] = True
        return jsonify({"action": get_action_dict(action), "pause": True})
    else:
        return jsonify({"action": get_action_dict(action), "pause": False})

@app.route('/check_unpause', methods=['GET'])
def check_unpause():
    global is_training, completed_games
    agent_id = request.args.get('agent_id')

    if all([data["paused"] for data in agent_data.values()]) and not is_training:
        is_training = True
        print("Training started")

        """Logging code"""
        if completed_games >= plot_frequency:
            print("Plotting statistics")
            plot_statistics()
        else:
            print(f"Not enough games completed for plotting ({completed_games}/{plot_frequency})")
        """End of logging code"""

        # Train using PPO
        did_train = model.learn()

        for data in agent_data.values():
            data["paused"] = False
        is_training = False

        print("Training ended, did_train:", did_train)
        return jsonify({"unpause": True})

    if agent_id in agent_data and not agent_data[agent_id]["paused"]:
        return jsonify({"unpause": True})

    return jsonify({"unpause": False})

""" Utility functions """
def calculateReward(last_state, observation, done, win):
    if win:
        return 1
    if done and not win:
        return -1
    
    # This is the difference in the % of the game completed
    reward = (observation[0] - last_state[0]) * 10
    return reward

# Utility function to convert action index to action dictionary.
def get_action_dict(action_index):
    action_mappings = {
        0: {"up": True},
        1: {"up": True, "left": True},
        2: {"up": True, "right": True},
    }

    # Get the action mapping for the given index
    action_dict = action_mappings[action_index]

    # Ensure all actions are included in the dictionary
    all_actions = ["up", "left", "right", "boost"]
    for action in all_actions:
        if action not in action_dict:
            action_dict[action] = False

    return action_dict

"""Logging code"""
# Plot statistics and save to ./statistics.png
def plot_statistics():
    global averages_array, completed_games, total_percentage_completed, total_reward
    print("Plotting statistics")

    # Calculate averages for the current batch of games
    avg_reward = total_reward / completed_games
    avg_percentage = total_percentage_completed / completed_games

    # Append averages to the array
    averages_array.append((avg_reward, avg_percentage))

    # Reset counters for the next batch
    completed_games = 0
    total_percentage_completed = 0
    total_reward = 0

    # Extract data for plotting
    rewards, percentages = zip(*averages_array)
    games = [i * plot_frequency for i in range(1, len(averages_array) + 1)]

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