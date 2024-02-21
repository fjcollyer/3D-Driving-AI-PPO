from tensorflow.keras.models import Model
from tensorflow.keras.layers import Dense
from tensorflow.keras.optimizers import Adam
from tensorflow.keras.initializers import glorot_uniform


class ActorNetwork(Model):
    def __init__(self, n_actions, input_dims, alpha, fc1_dims=512, fc2_dims=256, fc3_dims=128):
        super(ActorNetwork, self).__init__()
        self.fc1 = Dense(fc1_dims, activation='relu',
                         kernel_initializer=glorot_uniform(), input_shape=(input_dims,))
        self.fc2 = Dense(fc2_dims, activation='relu',
                         kernel_initializer=glorot_uniform())
        self.fc3 = Dense(fc3_dims, activation='relu',
                         kernel_initializer=glorot_uniform())
        self.pi = Dense(n_actions, activation='softmax',
                        kernel_initializer=glorot_uniform())

        self.compile(optimizer=Adam(learning_rate=alpha))

    def call(self, state):
        x = self.fc1(state)
        x = self.fc2(x)
        x = self.fc3(x)
        pi = self.pi(x)
        return pi
