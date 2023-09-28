import time
import numpy as np
import tensorflow as tf
import random
from threading import Thread, Lock
from collections import deque
import itertools
from tensorflow.keras.callbacks import TensorBoard
from datetime import datetime
import os


class RLModel:
    def __init__(self, state_size, action_size, learning_rate=0.001, memory_size=10000):
        self.state_size = state_size
        self.action_size = action_size
        self.action_combinations = [list(i) for i in itertools.product([0, 1], repeat=action_size)]  # All 2^6 action combinations
        self.memory = deque(maxlen=memory_size)
        self.gamma = 0.95
        self.epsilon = 1.0
        self.epsilon_min = 0.01
        self.epsilon_decay = 0.995
        self.model = self._build_model(learning_rate)
        self.lock = Lock()
        self.training_thread = None
        self.running = True

        log_dir = "./logs/fit/" + datetime.now().strftime("%Y%m%d-%H%M%S")
        os.makedirs(log_dir, exist_ok=True)
        self.tensorboard_callback = TensorBoard(log_dir=log_dir, histogram_freq=1)
    
    def _build_model(self, learning_rate):
        model = tf.keras.Sequential([
            tf.keras.layers.Input(shape=(self.state_size,)),
            tf.keras.layers.Dense(128, activation='relu'),
            tf.keras.layers.Dense(64, activation='relu'),
            tf.keras.layers.Dense(len(self.action_combinations), activation='linear')  # Q-value for each action combination
        ])
        optimizer = tf.keras.optimizers.Adam(learning_rate=learning_rate)
        model.compile(optimizer=optimizer, loss='mse')
        return model
    
    def act(self, state):
        if self.epsilon > self.epsilon_min:
            self.epsilon *= self.epsilon_decay

        if np.random.rand() <= self.epsilon:
            return random.choice(self.action_combinations)  # Choose a random action combination
        
        q_values = self.model.predict(state)[0]
        optimal_action_index = np.argmax(q_values)
        return self.action_combinations[optimal_action_index]  # Return the optimal action combination
    
    def _train_async(self, batch_size=32):
        step = 0  # Adding a step counter to track the training step
        while self.running:
            self.lock.acquire()
            if len(self.memory) < batch_size:
                self.lock.release()
                continue
            batch = random.sample(self.memory, batch_size)
            self.lock.release()

            # Create a writer
            writer = tf.summary.create_file_writer(self.tensorboard_callback.log_dir)

            for state, action, reward, next_state, done in batch:
                target = reward
                if not done:
                    future_q_values = self.model.predict(next_state)[0]
                    expected_future_reward = np.max(future_q_values)  # Calculating Expected Future Reward
                    target = reward + self.gamma * expected_future_reward

                current_q_values = self.model.predict(state)[0]
                action_index = self.action_combinations.index(action[0].tolist())  # Fixed the line here
                current_q_values[action_index] = target

                history = self.model.fit(
                    state, 
                    current_q_values.reshape(-1, len(self.action_combinations)), 
                    verbose=0, 
                    callbacks=[self.tensorboard_callback]
                )

                # Log scalars
                with writer.as_default():
                    tf.summary.scalar('loss', history.history['loss'][0], step=step)
                    tf.summary.scalar('expected_future_reward', expected_future_reward, step=step)
                    tf.summary.scalar('epsilon', self.epsilon, step=step)
                writer.flush()  # Ensure that the data is written to file
                
                step += 1  # Increment the step counter after each training iteration

            time.sleep(2)



    def remember(self, state, action, reward, next_state, done):
        self.lock.acquire()  # Acquire the lock before modifying the memory
        self.memory.append((state, action, reward, next_state, done))
        self.lock.release()  # Release the lock after modifying the memory

    def start_training(self):
        self.training_thread = Thread(target=self._train_async)  # Initialize the training thread
        self.training_thread.start()  # Start the training thread

    def stop_training(self):
        self.running = False  # Stop the training loop
        if self.training_thread and self.training_thread.is_alive():
            self.training_thread.join()  # Wait for the training thread to finish
    
    def save(self, filepath):
        self.model.save(filepath)

    def load(self, filepath):
        self.model = tf.keras.models.load_model(filepath)