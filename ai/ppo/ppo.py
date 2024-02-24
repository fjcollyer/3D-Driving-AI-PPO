import os
import numpy as np
import tensorflow as tf
from tensorflow_probability.python.distributions import Categorical

# Local imports
from .ppo_memory import PPOMemory
from .ppo_actor import ActorNetwork
from .ppo_critic import CriticNetwork


class Agent:
    def __init__(self, n_actions, input_dims, save_folder_actor, save_folder_critic, gamma=0.99, alpha=0.0003, gae_lambda=0.95, policy_clip=0.2, batch_size=64, n_epochs=10, entropy_coeff=0.1):
        self.gamma = gamma
        self.policy_clip = policy_clip
        self.n_epochs = n_epochs
        self.gae_lambda = gae_lambda
        self.entropy_coeff = entropy_coeff
        self.learning_trigger = 100

        self.actor = ActorNetwork(n_actions, input_dims, alpha)
        self.critic = CriticNetwork(input_dims, alpha)
        self.memory = PPOMemory(batch_size)

        self.save_folder_actor = save_folder_actor
        self.save_folder_critic = save_folder_critic

        self.prev_average_track_completion = 0

    def remember(self, state, action, probs, vals, reward, done):
        self.memory.store_memory(state, action, probs, vals, reward, done)

    def choose_action(self, observation):
        state = np.array([observation], dtype=np.float32)
        pi = self.actor(state)
        dist = Categorical(probs=pi)
        action = dist.sample().numpy()[0]
        value = self.critic(state)

        probs = np.log(pi[0, action])
        value = value.numpy()[0, 0]

        return action, probs, value

    def learn(self, total_completed_games, average_track_completion):
        if len(self.memory.states) < self.learning_trigger:
            return False

        for _ in range(self.n_epochs):
            state_arr, action_arr, old_prob_arr, vals_arr, reward_arr, dones_arr, batches = self.memory.generate_batches()

            values = vals_arr
            advantage = np.zeros(len(reward_arr), dtype=np.float32)

            for t in range(len(reward_arr)-1):
                discount = 1
                a_t = 0
                for k in range(t, len(reward_arr)-1):
                    a_t += discount * \
                        (reward_arr[k] + self.gamma * values[k+1]
                         * (1 - int(dones_arr[k])) - values[k])
                    discount *= self.gamma * self.gae_lambda
                advantage[t] = a_t

            values = np.array(values, dtype=np.float32)
            for batch in batches:
                states = np.array(state_arr[batch], dtype=np.float32)
                old_probs = np.array(old_prob_arr[batch], dtype=np.float32)
                actions = np.array(action_arr[batch], dtype=np.int32)

                with tf.GradientTape() as tape_a, tf.GradientTape() as tape_c:
                    pi = self.actor(states)
                    dist = Categorical(probs=pi)
                    new_probs = dist.log_prob(actions)
                    prob_ratio = tf.exp(new_probs - old_probs)
                    weighted_probs = advantage[batch] * prob_ratio
                    weighted_clipped_probs = tf.clip_by_value(
                        prob_ratio, 1-self.policy_clip, 1+self.policy_clip) * advantage[batch]
                    actor_loss = - \
                        tf.reduce_mean(tf.minimum(
                            weighted_probs, weighted_clipped_probs))

                    critic_value = self.critic(states)
                    critic_value = tf.squeeze(critic_value)
                    returns = advantage[batch] + values[batch]
                    # Ensure returns has the correct shape
                    returns = tf.expand_dims(returns, 1)

                    critic_loss = self.critic.compiled_loss(
                        returns, critic_value)

                    entropy = dist.entropy()
                    entropy_loss = -self.entropy_coeff * \
                        tf.reduce_mean(entropy)

                    total_loss = actor_loss + 0.5 * critic_loss + entropy_loss

                grad_a = tape_a.gradient(
                    total_loss, self.actor.trainable_variables)
                grad_c = tape_c.gradient(
                    total_loss, self.critic.trainable_variables)
                self.actor.optimizer.apply_gradients(
                    zip(grad_a, self.actor.trainable_variables))
                self.critic.optimizer.apply_gradients(
                    zip(grad_c, self.critic.trainable_variables))

            # Call adjust_entropy_coeff at the end of the learn method
            self.adjust_entropy_coeff(
                average_track_completion, self.prev_average_track_completion)
            self.prev_average_track_completion = average_track_completion
            print("Entropy Coeff: ", self.entropy_coeff)
            # Clear memory and save models
            self.memory.clear_memory()
            self.save_models(total_completed_games, average_track_completion)
            return True

    # Loss gets -1, anything else is based on % completed difference
    def calculateReward(self, last_state, observation, done, win):
        if done and not win:
            return -1  # Penalty for losing the game

        percent_completed = observation[0] * 100
        last_percent_completed = last_state[0] * 100
        difference = percent_completed - last_percent_completed
        return difference

    def adjust_entropy_coeff(self, average_track_completion, prev_average_track_completion):
        pass
        # if average_track_completion < prev_average_track_completion:
        #     self.entropy_coeff *= 1.05
        # else:
        #     self.entropy_coeff *= 0.95

    def save_models(self, episode_number, average_track_completion):
        print('... saving models ...')
        average_track_completion = int(average_track_completion)
        actor_file_path = os.path.join(
            self.save_folder_actor, f'actor_episodes_{episode_number}_avg_{average_track_completion}')
        critic_file_path = os.path.join(
            self.save_folder_critic, f'critic_episodes_{episode_number}_avg_{average_track_completion}')

        if not os.path.exists(self.save_folder_actor):
            os.makedirs(self.save_folder_actor)
        if not os.path.exists(self.save_folder_critic):
            os.makedirs(self.save_folder_critic)

        self.actor.save(actor_file_path, save_format="tf")
        self.critic.save(critic_file_path, save_format="tf")

    def load_models(self, episode_number, average_track_completion):
        print('... loading models ...')
        actor_file_path = os.path.join(
            self.save_folder_actor, f'actor_episodes_{episode_number}_avg_{average_track_completion}')
        critic_file_path = os.path.join(
            self.save_folder_critic, f'critic_episodes_{episode_number}_avg_{average_track_completion}')

        if os.path.exists(actor_file_path):
            self.actor = tf.keras.models.load_model(actor_file_path)
        if os.path.exists(critic_file_path):
            self.critic = tf.keras.models.load_model(critic_file_path)
