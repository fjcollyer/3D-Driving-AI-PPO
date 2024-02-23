import json
import subprocess
import sys
from datetime import datetime
from ai.ppo.ppo import Agent
import os
from flask import Flask, request, jsonify
import numpy as np
from flask_cors import CORS
import matplotlib.pyplot as plt
plt.switch_backend('Agg')

# Initialize Flask app
app = Flask(__name__, static_folder='dist')
CORS(app)


def load_config():
    with open('./ui/static/common-with-flask-config.json') as f:
        common_config = json.load(f)
        for key in common_config:
            config[key] = common_config[key]


def update_config(training_mode):
    with open('./ui/static/common-with-flask-config.json', 'r+') as f:
        common_config = json.load(f)
        common_config['training_mode'] = training_mode
        f.seek(0)
        json.dump(common_config, f, indent=4)
        f.truncate()


def start_ui_app():
    os.chdir('ui')
    web_app_process = subprocess.Popen(['npm', 'run', 'dev'])
    os.chdir('..')
    return web_app_process


def create_production_build():
    # Set training mode to false
    update_config(False)

    # Proceed with creating the production build
    os.chdir('ui')
    subprocess.run(['npm', 'run', 'build'], check=True)
    os.chdir('..')


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
    games = [i * train_frequency for i in range(1, len(averages_array) + 1)]

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

    return avg_percentage


def rename_existing_save_folder(folder_path):
    """Renames the existing save folder to include a suffix with the current datetime."""
    datetime_suffix = datetime.now().strftime("%Y%m%d_%H%M%S")
    new_folder_name = f"{folder_path}_{datetime_suffix}"
    os.rename(folder_path, new_folder_name)
    print(f"Renamed existing save folder to: {new_folder_name}")


#
# Main entry point and logic
#
if __name__ == "__main__":
    try:
        print("Would you like to create a production build of the UI app? (y/n)")
        should_create_production_build = input().strip().lower()
        if should_create_production_build == "y":
            try:
                create_production_build()
                print("\nProduction build completed successfully to ./ui/dist")
            except subprocess.CalledProcessError:
                print("Error occurred during the production build process.")
                sys.exit(1)
            sys.exit(0)

        print("Would you like to run the app in training mode? (y/n)")
        training_mode = input().strip().lower() == "y"
        saved_models_dir = "./ai/saved_ppo_tf_models"
        if training_mode:
            if os.path.exists(saved_models_dir):
                print(
                    f"The directory {saved_models_dir} already exists. Would you like to rename it with a datetime suffix? (y/n)")
                rename_folder = input().strip().lower() == "y"
                if rename_folder:
                    rename_existing_save_folder(saved_models_dir)

        # Configuration variables
        config = {
            "save_folder_actor": f"{saved_models_dir}/actor",
            "save_folder_critic": f"{saved_models_dir}/critic",
        }
        update_config(training_mode)
        load_config()
        print(config)
        web_app_process = start_ui_app()

        if not training_mode:
            # In non-training mode, the Flask app exits after starting the UI app
            print("UI app started in non-training mode")
        else:
            # Flask app continues to run in training mode
            model = Agent(n_actions=config["action_space"],
                          input_dims=config["state_space"],
                          save_folder_actor=config["save_folder_actor"],
                          save_folder_critic=config["save_folder_critic"]
                          )

            # Struct to keep track of agent-specific data for enabling multiple agents at once (multiple browser tabs)
            agent_data = {}
            is_training = False
            train_frequency = 20

            """Logging code"""
            total_completed_games = 0
            averages_array = []
            completed_games = 0
            total_percentage_completed = 0
            total_reward = 0
            """End of logging code"""

            #
            #   API endpoint used when training the AI locally
            #   Each agent (browser tab) will call this endpoint continuously to get the next action
            #
            @app.route('/get_action', methods=['POST'])
            def get_action():
                global completed_games, total_percentage_completed, total_reward, total_completed_games

                data = request.json
                agent_id = data['agent_id']
                observation = np.array(list(data['observation'].values()))
                done = data['done']
                win = data['win']
                time_since_game_start = data['time_since_game_start']

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
                    reward = model.calculateReward(
                        current_agent["last_state"], observation, done, win)
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

                # Convert action int to dictionary of actions
                action_str = str(action)
                action_dict = config["action_mappings"][action_str]
                for action in config["actions_list"]:
                    if action not in action_dict:
                        action_dict[action] = False

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
                    return jsonify({"action": action_dict, "pause": True})
                else:
                    return jsonify({"action": action_dict, "pause": False})

            #
            #   API endpoint used when training the AI locally
            #   Each agent (browser tab) will call this endpoint continuously to check if it should unpause
            #

            @app.route('/check_unpause', methods=['GET'])
            def check_unpause():
                global is_training, completed_games

                agent_id = request.args.get('agent_id')

                if all([data["paused"] for data in agent_data.values()]) and not is_training:
                    is_training = True
                    print("Training started")
                    did_train = False

                    if completed_games >= train_frequency:
                        print("Plotting statistics")
                        avarage_track_completion = plot_statistics()
                        did_train = model.learn(
                            total_completed_games, avarage_track_completion)
                    else:
                        print(
                            f"Not enough games completed for training ({completed_games}/{train_frequency})")

                    for data in agent_data.values():
                        data["paused"] = False
                    is_training = False

                    print("Training ended, did_train:", did_train)
                    return jsonify({"unpause": True})

                if agent_id in agent_data and not agent_data[agent_id]["paused"]:
                    return jsonify({"unpause": True})

                return jsonify({"unpause": False})

        # Start the Flask app
        port = int(os.environ.get('PORT', 8080))
        app.run(debug=False, host='0.0.0.0', port=port)
    except KeyboardInterrupt:
        print("Ctrl+C pressed. Shutting down both apps.")
        if web_app_process:
            web_app_process.terminate()
        sys.exit(0)
