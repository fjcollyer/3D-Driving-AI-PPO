import time
import numpy as np
import tensorflow as tf
from collections import deque
import random

class DQNAgent:
    def __init__(self, action_space, state_space):
        self.action_space = action_space
        self.state_space = state_space

        # Hyperparameters
        self.lr = 0.001
        self.gamma = 0.99
        self.batch_size = 128
        self.epsilon = 1.0
        self.epsilon_decay = 0.995
        self.epsilon_min = 0.1
        self.memory = deque(maxlen=20000)
        self.target_update_freq = 2 # Every x times the train function is called, update the target network
        self.train_step_counter = 0

        # Create main and target Q-networks
        self.model = self.create_model()
        self.target_model = self.create_model()
        self.target_model.set_weights(self.model.get_weights())

    def create_model(self):
        model = tf.keras.models.Sequential([
            tf.keras.layers.Dense(24, activation='relu', input_dim=self.state_space),
            tf.keras.layers.Dense(24, activation='relu'),
            tf.keras.layers.Dense(self.action_space, activation='linear')
        ])
        model.compile(optimizer=tf.keras.optimizers.Adam(learning_rate=self.lr), loss='mse')
        return model

    def store_data(self, state, action, next_state, reward, done):
        self.memory.append((state, action, next_state, reward, done))

    def get_action(self, state):
        if np.random.rand() <= self.epsilon:
            return np.random.choice(self.action_space)
        q_values = self.model.predict(state.reshape(1, -1))
        return np.argmax(q_values[0])

    def learn(self):
        print("Epsilon: ", self.epsilon)
        if len(self.memory) < self.batch_size:
            return

        minibatch = random.sample(self.memory, self.batch_size)
        states, actions, next_states, rewards, dones = zip(*minibatch)
        states = np.array(states)
        next_states = np.array(next_states)
        rewards = np.array(rewards)
        dones = np.array(dones)

        target_q_values = self.target_model.predict(next_states)
        max_next_q_values = np.max(target_q_values, axis=1)
        targets = rewards + (1 - dones) * self.gamma * max_next_q_values

        q_values = self.model.predict(states)
        for i, action in enumerate(actions):
            q_values[i][action] = targets[i]

        self.model.train_on_batch(states, q_values)

        # Decay epsilon
        self.epsilon = max(self.epsilon_min, self.epsilon * self.epsilon_decay)

        # Update target network
        self.train_step_counter += 1
        if self.train_step_counter % self.target_update_freq == 0:
            self.target_model.set_weights(self.model.get_weights())