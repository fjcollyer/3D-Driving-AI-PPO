from flask import Flask, request, jsonify
from flask_cors import CORS
import tensorflow as tf
import numpy as np
import threading
import collections
import os
import logging
from datetime import datetime

app = Flask(__name__)
CORS(app)
logging.basicConfig(level=logging.INFO)

Experience = collections.namedtuple('Experience', ['state', 'action', 'reward', 'next_state', 'done'])
state_shape = 8
action_shape = 4

class EnhancedPPOAgent:
    def __init__(self, model_path='./model/fjcmodel'):
        self.model_path = model_path
        self.model = self._create_model()
        self.optimizer = tf.keras.optimizers.Adam(learning_rate=0.00025, clipnorm=1.0)
        self.buffer = collections.deque(maxlen=10000)
        self.gamma = 0.99
        self.lamda = 0.95
        self.clip_epsilon = 0.2
        self.train_interval = 10
        self.lock = threading.Lock()
        self.tensorboard_log_dir = f'./logs/{datetime.now().strftime("%Y%m%d-%H%M%S")}'
        self.summary_writer = tf.summary.create_file_writer(self.tensorboard_log_dir)

        if os.path.exists(model_path):
            self.model.load_weights(model_path)
            logging.info("Model weights loaded successfully.")
        else:
            logging.info("Model weights not found. Creating new model.")
        
        threading.Thread(target=self._train_model_thread).start()

    def _create_model(self):
        input_layer = tf.keras.layers.Input(shape=(state_shape,))
        norm_layer = tf.keras.layers.BatchNormalization()(input_layer)
        hidden_layer1 = tf.keras.layers.Dense(128, activation='relu', kernel_regularizer=tf.keras.regularizers.l2(0.01))(norm_layer)
        hidden_layer2 = tf.keras.layers.Dense(64, activation='relu', kernel_regularizer=tf.keras.regularizers.l2(0.01))(hidden_layer1)
        output_layer = tf.keras.layers.Dense(action_shape, activation='sigmoid')(hidden_layer2)
        model = tf.keras.models.Model(inputs=input_layer, outputs=output_layer)
        return model

    def get_action(self, state):
        probabilities = self.model.predict(state.reshape(1, -1))[0]
        action = np.random.binomial(1, probabilities)
        return action
    
    def store_experience(self, experience):
        with self.lock:
            self.buffer.append(experience)
    
    def _train_model_thread(self):
        while True:
            with self.lock:
                if len(self.buffer) >= self.train_interval:
                    experiences = [self.buffer.popleft() for _ in range(self.train_interval)]
                else:
                    continue

            states, actions, rewards, next_states, dones = map(np.array, zip(*experiences))
            advantages, returns = self._calculate_advantages_and_returns(rewards, next_states, dones)
            advantages = (advantages - advantages.mean()) / (advantages.std() + 1e-10)
            
            with tf.GradientTape() as tape:
                probabilities = self.model(states)
                # The loss calculation needs to be adjusted for multi-dimensional action space
                chosen_probabilities = tf.reduce_sum(actions * tf.math.log(probabilities + 1e-10), axis=-1)
                surr_adv = advantages * chosen_probabilities
                loss = -tf.reduce_mean(tf.math.minimum(surr_adv, tf.clip_by_value(surr_adv, 1 - self.clip_epsilon, 1 + self.clip_epsilon) * advantages))

            gradients = tape.gradient(loss, self.model.trainable_variables)
            self.optimizer.apply_gradients(zip(gradients, self.model.trainable_variables))
            
            self.model.save_weights(self.model_path, save_format='tf')
            with self.summary_writer.as_default():
                tf.summary.scalar('loss', loss, step=self.optimizer.iterations)
                tf.summary.scalar('reward', np.sum(rewards), step=self.optimizer.iterations)
                tf.summary.scalar('advantage', np.mean(advantages), step=self.optimizer.iterations)

    def _calculate_advantages_and_returns(self, rewards, next_states, dones):
        advantages = np.zeros_like(rewards, dtype=np.float32)
        returns = np.zeros_like(rewards, dtype=np.float32)
        running_advantage = 0
        running_return = 0
        for t in reversed(range(len(rewards))):
            running_return = rewards[t] + self.gamma * running_return * (1 - dones[t])
            delta = rewards[t] + self.gamma * running_return * (1 - dones[t]) - running_return
            running_advantage = delta + self.gamma * self.lamda * running_advantage * (1 - dones[t])
            advantages[t] = running_advantage
            returns[t] = running_return
        return advantages, returns

agent = EnhancedPPOAgent()

@app.route('/get_action', methods=['POST'])
def get_action():
    try:
        data = request.json
        state = np.array(data['currentState'], dtype=np.float32)
        action = agent.get_action(state)
        action_dict = {
            'up': bool(action[0]),
            'right': bool(action[1]),
            'left': bool(action[2]),
            'boost': bool(action[3]),
        }
        experience = Experience(state, action, data['reward'], np.array(data['previousState'], dtype=np.float32), data['gameOver'])
        agent.store_experience(experience)
        return jsonify(action_dict)
    except Exception as e:
        logging.error(f"Error while processing request: {e}")
        return jsonify({'error': 'Internal Server Error'}), 500

if __name__ == '__main__':
    app.run(port=5001)