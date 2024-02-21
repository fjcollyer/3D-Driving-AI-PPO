from tensorflow.keras.models import Model
from tensorflow.keras.layers import Dense
from tensorflow.keras.optimizers import Adam
from tensorflow.keras.losses import MeanSquaredError
from tensorflow.keras.initializers import glorot_uniform


class CriticNetwork(Model):
    def __init__(self, input_dims, alpha, fc1_dims=256, fc2_dims=256, fc3_dims=128):
        super(CriticNetwork, self).__init__()
        self.fc1 = Dense(fc1_dims, activation='relu',
                         kernel_initializer=glorot_uniform(), input_shape=(input_dims,))
        self.fc2 = Dense(fc2_dims, activation='relu',
                         kernel_initializer=glorot_uniform())
        self.fc3 = Dense(fc3_dims, activation='relu',
                         kernel_initializer=glorot_uniform())
        self.v = Dense(1, activation=None, kernel_initializer=glorot_uniform())

        self.compile(optimizer=Adam(learning_rate=alpha),
                     loss=MeanSquaredError())

    def call(self, state):
        x = self.fc1(state)
        x = self.fc2(x)
        x = self.fc3(x)
        v = self.v(x)
        return v
