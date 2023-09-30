import os
import logging
import random
import itertools
import numpy as np
import tensorflow as tf
from datetime import datetime
from collections import deque
from threading import Thread, Event
from flask import Flask, request, jsonify
from tensorflow.keras.callbacks import TensorBoard
from queue import Queue

# Set up Logging
logging.basicConfig(level=logging.INFO)

class ImprovedRLModel:
    def __init__(self, state_size, action_size, learning_rate=0.01, memory_size=10000, batch_size=128):
        self.state_size = state_size
        self.action_size = action_size
        self.action_combinations = [list(i) for i in itertools.product([0, 1], repeat=action_size)]
        self.memory = deque(maxlen=memory_size)
        self.batch_size = batch_size
        self.gamma = 0.95
        self.epsilon = 1.0
        self.epsilon_min = 0.025
        self.epsilon_decay = 0.998
        self.reset_epsilon_frequency = 200
        self.model = self._build_model(learning_rate)
        self.training_thread = None
        self.running = Event()
        self.running.set()

        log_dir = "./logs/fit/" + datetime.now().strftime("%Y%m%d-%H%M%S")
        os.makedirs(log_dir, exist_ok=True)
        self.tensorboard_callback = TensorBoard(log_dir=log_dir, histogram_freq=1)

    def _build_model(self, learning_rate):
        model = tf.keras.Sequential([
            tf.keras.layers.Input(shape=(self.state_size,)),
            tf.keras.layers.Dense(128, activation='relu'),
            tf.keras.layers.Dense(64, activation='relu'),
            tf.keras.layers.Dense(len(self.action_combinations), activation='linear')
        ])
        optimizer = tf.keras.optimizers.Adam(learning_rate=learning_rate)
        model.compile(optimizer=optimizer, loss='mse')
        return model

    def act(self, state):
        if self.epsilon > self.epsilon_min:
            self.epsilon *= self.epsilon_decay
        if np.random.rand() <= self.epsilon:
            return random.choice(self.action_combinations)
        
        q_values = self.model.predict(state)[0]
        return self.action_combinations[np.argmax(q_values)]

    def _train_async(self):
        step = 0
        while self.running.is_set():
            if len(self.memory) < self.batch_size:
                continue
            batch = random.sample(self.memory, self.batch_size)
            self._train_on_batch(batch, step)
            step += 1
            if step % self.reset_epsilon_frequency == 0:
                self.epsilon = 1.0

    def _train_on_batch(self, batch, step):
        loss_accumulator = efr_accumulator = epsilon_accumulator = reward_accumulator = 0.0
        training_steps = len(batch)

        writer = tf.summary.create_file_writer(self.tensorboard_callback.log_dir)

        for state, action, reward, next_state, done in batch:
            
            reward_accumulator += reward
            target = reward

            if not done:
                target += self.gamma * np.max(self.model.predict(next_state)[0])

            current_q_values = self.model.predict(state)[0]
            action_index = self.action_combinations.index(action[0].tolist())
            current_q_values[action_index] = target

            history = self.model.fit(state, current_q_values.reshape(-1, len(self.action_combinations)), verbose=0)
            loss_accumulator += history.history['loss'][0]
            efr_accumulator += target
            epsilon_accumulator += self.epsilon

        with writer.as_default():
            tf.summary.scalar('session_avg_loss', loss_accumulator / training_steps, step=step)
            tf.summary.scalar('session_avg_expected_future_reward', efr_accumulator / training_steps, step=step)
            tf.summary.scalar('session_avg_epsilon', epsilon_accumulator / training_steps, step=step)
            tf.summary.scalar('session_avg_reward', reward_accumulator / training_steps, step=step)
        
        writer.flush()
        logging.info(f"Session Avg Loss: {loss_accumulator / training_steps}, Avg EFR: {efr_accumulator / training_steps}, Avg Epsilon: {epsilon_accumulator / training_steps}")

    def remember(self, state, action, reward, next_state, done):
      self.memory.append((state, action, reward, next_state, done))

    def start_training(self):
        self.training_thread = Thread(target=self._train_async)
        self.training_thread.start()

    def stop_training(self):
        self.running.clear()
        if self.training_thread and self.training_thread.is_alive():
            self.training_thread.join()

    def save(self, filepath):
        self.model.save(filepath)

    def load(self, filepath):
        self.model = tf.keras.models.load_model(filepath)