import time
import traceback
import numpy as np
import tensorflow as tf
from tensorflow.keras import layers
from collections import deque


class RLModel:
    def __init__(self):
        self.gamma = 0.99
        self.lambda_ = 0.95
        self.clip_epsilon = 0.2
        self.learning_rate = 0.0003
        self.value_coefficient = 0.5
        self.entropy_coefficient = 0.01
        self.num_epochs = 5
        self.batch_size = 32
        self.memory = deque(maxlen=100000)
        self.transitions_to_train = self.batch_size * self.num_epochs

        self.num_inputs = 7  # 7 state variables
        # self.action_list = ["up", "right", "left"]
        self.action_list = {
            0: {
                "left": True,
                "right": False,
            },
            1: {
                "left": False,
                "right": True,
            },
            2: {
                "left": False,
                "right": False,
            },
        }
        # self.num_actions = 2 ** len(self.action_list)
        self.num_actions = 3

        self.global_step = 0  # Initialize global step - num total epochs
        self.summary_writer = tf.summary.create_file_writer("logs/")

        self.optimizer = tf.keras.optimizers.Adam(learning_rate=self.learning_rate)

        inputs = layers.Input(shape=(self.num_inputs,))
        advantage = layers.Input(shape=(1,))
        old_prediction = layers.Input(shape=(self.num_actions,))

        x = layers.Dense(64, activation='relu')(inputs)
        x = layers.Dense(64, activation='relu')(x)
        policy_logits = layers.Dense(self.num_actions)(x)
        values = layers.Dense(1)(x)

        self.model = tf.keras.Model(inputs=[inputs, advantage, old_prediction], outputs=[policy_logits, values])

    def _ppo_loss(self, advantage, old_prediction, prob):
        r = prob / (old_prediction + 1e-10)
        return -tf.reduce_mean(tf.minimum(r * advantage, tf.clip_by_value(r, 1 - self.clip_epsilon, 1 + self.clip_epsilon) * advantage) + self.entropy_coefficient * (prob * tf.math.log(prob + 1e-10)))

    def compute_action(self, state):
        state = state.reshape([1, -1])
        logits, value = self.model.predict([state, np.zeros((1, 1)), np.zeros((1, self.num_actions))])  # Adjust the last np.zeros dimension
        policy = tf.nn.softmax(logits)
        action = np.argmax(np.random.multinomial(1, policy.numpy()[0]))
        return action, policy.numpy()[0]

    def action_dict(self, action):
        return self.action_list[action]
        # action_dict = {}
        # for i, action_name in enumerate(self.action_list):
        #     action_dict[action_name] = bool(action & (1 << i))
        # return action_dict

    def store_transition(self, state, action, reward, next_state, done, policy):
        self.memory.append({'state': state, 'action': action, 'reward': reward, 'next_state': next_state, 'done': done, 'policy': policy})

    def train(self):
        if len(self.memory) < self.batch_size:
            return

        batch = np.random.choice(self.memory, self.batch_size, replace=False)

        states = np.array([trans['state'] for trans in batch])
        actions = np.array([trans['action'] for trans in batch])
        rewards = np.array([trans['reward'] for trans in batch])
        next_states = np.array([trans['next_state'] for trans in batch])
        dones = np.array([trans['done'] for trans in batch])
        old_policies = np.array([trans['policy'] for trans in batch])

        returns = []
        discounted_sum = 0
        for reward, done in zip(rewards[::-1], dones[::-1]):
            if done:
                discounted_sum = 0
            discounted_sum = reward + self.gamma * discounted_sum
            returns.append(discounted_sum)
        returns.reverse()
        returns = np.array(returns)
        advantages = returns - self.model.predict([states, np.zeros_like(returns), np.zeros_like(old_policies)])[1].flatten()

        with self.summary_writer.as_default():
            for epoch in range(self.num_epochs):
                for i in range(0, len(states), self.batch_size):
                    with tf.GradientTape() as tape:
                        state_batch = states[i:i+self.batch_size]
                        advantage_batch = advantages[i:i+self.batch_size].reshape(-1, 1)
                        old_policy_batch = old_policies[i:i+self.batch_size]
                        return_batch = returns[i:i+self.batch_size].reshape(-1, 1)
                        logits, values = self.model([state_batch, advantage_batch, old_policy_batch], training=True)

                        prob = tf.nn.softmax(logits)
                        policy_loss = self._ppo_loss(advantage_batch, old_policy_batch, prob)
                        value_loss = tf.reduce_mean(tf.square(return_batch - values))
                        total_loss = policy_loss + value_loss

                    grads = tape.gradient(total_loss, self.model.trainable_variables)
                    self.optimizer.apply_gradients(zip(grads, self.model.trainable_variables))

                    # Log metrics at each global step
                    tf.summary.scalar('Loss', total_loss, step=self.global_step)
                    tf.summary.scalar('Policy Loss', policy_loss, step=self.global_step)
                    tf.summary.scalar('Value Loss', value_loss, step=self.global_step)
                    tf.summary.scalar('Mean Reward', np.mean(rewards), step=self.global_step)
                    tf.summary.scalar('Mean Advantage', np.mean(advantages), step=self.global_step)
                    tf.summary.scalar('Mean Return', np.mean(returns), step=self.global_step)
                    self.global_step += 1

                self.summary_writer.flush()

        self.memory.clear()
        time.sleep(5)