import matplotlib.pyplot as plt
import numpy as np
import os

dir_path = './saved_ppo_tf_models/actor'
dir_names = [name for name in os.listdir(
    dir_path) if os.path.isdir(os.path.join(dir_path, name))]

episodes = []
avgs = []
for dir_name in dir_names:
    parts = dir_name.split('_')
    episode_num = int(parts[2])
    avg_num = float(parts[4])
    episodes.append(episode_num)
    avgs.append(avg_num)

sorted_data = sorted(zip(episodes, avgs), key=lambda x: x[0])
episodes_sorted, avgs_sorted = zip(*sorted_data)

coefficients = np.polyfit(episodes_sorted, avgs_sorted, 4)
polynomial = np.poly1d(coefficients)

x_values = np.linspace(min(episodes_sorted), max(episodes_sorted), 100)
y_values = polynomial(x_values)

y_clamped = np.clip(y_values, 0, 100)

plt.figure(figsize=(6, 6))
plt.scatter(episodes_sorted, avgs_sorted, alpha=0.2, s=5)
plt.plot(x_values, y_clamped, 'r', linewidth=2.5)
plt.xlabel('Episode Number', fontsize=12)
plt.ylabel('Average Track Completion', fontsize=12)
plt.xticks(fontsize=10)
plt.yticks(fontsize=10)
plt.grid(True)

plt.savefig('./plot_model_perf.png', dpi=500, bbox_inches='tight')
