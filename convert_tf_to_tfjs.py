import subprocess
import os


def prompt_episode_number():
    """
    Prompt the user to input the episode number.
    """
    try:
        episode_number = int(
            input("Enter the episode number of the models you are targeting: "))
        return episode_number
    except ValueError:
        print("Please enter a valid integer for the episode number.")
        exit(1)


def prompt_additional_save():
    """
    Prompt the user to decide if they want to save the models to an additional directory.

    Returns:
    bool: True if the user wants to save to the additional directory, False otherwise.
    """
    response = input(
        "Would you like to save the converted models to './ui/static/tfjs_models' as well? (y/n): ")
    return response.strip().lower() == 'y'


def find_model_path(model_type, episode_number):
    """
    Find the model path based on the model type and episode number.

    Args:
    model_type (str): Type of the model ('actor' or 'critic').
    episode_number (int): Episode number of the model.

    Returns:
    str: The path to the model directory.
    """
    base_dir = f'./ai/saved_ppo_tf_models/{model_type}'
    for dirname in os.listdir(base_dir):
        if f'episodes_{episode_number}_' in dirname:
            return os.path.join(base_dir, dirname)
    print(
        f"No model found for '{model_type}' with episode number {episode_number}.")
    exit(1)


def ensure_directory_exists(directory):
    """
    Ensure the specified directory exists, creating it if it does not.

    Args:
    directory (str): The path to the directory.
    """
    os.makedirs(directory, exist_ok=True)


def convert_to_tfjs(model_type, episode_number, output_dirs):
    """
    Convert a TensorFlow saved model to TensorFlow.js format and save to specified directories.

    Args:
    model_type (str): Type of the model ('actor' or 'critic').
    episode_number (int): Episode number of the model. 
    output_dirs (list): Directories where the TensorFlow.js model will be saved. 
    """
    saved_model_dir = find_model_path(model_type, episode_number)

    for output_dir in output_dirs:
        output_path = os.path.join(
            output_dir, f'{model_type}_episodes_{episode_number}')

        # Ensure the output directory exists
        ensure_directory_exists(output_path)

        # Command to convert the model
        command = [
            "tensorflowjs_converter",
            "--input_format=tf_saved_model",
            saved_model_dir,
            output_path
        ]

        try:
            subprocess.run(command, check=True)
            print()
            print()
            print(
                f"Model '{model_type}' for episode {episode_number} converted successfully and saved to '{output_path}'")
        except subprocess.CalledProcessError as e:
            print()
            print()
            print(
                f"Error occurred while converting model '{model_type}' for episode {episode_number}: {e}")


def main():
    episode_number = prompt_episode_number()
    save_additional = prompt_additional_save()
    default_output_dir = "./ai/tfjs_models"
    additional_output_dir = "./ui/static/tfjs_models"

    output_dirs = [default_output_dir]
    if save_additional:
        output_dirs.append(additional_output_dir)

    # Convert both the actor and critic models
    for model_type in ['actor', 'critic']:
        convert_to_tfjs(model_type, episode_number, output_dirs)


if __name__ == "__main__":
    main()
