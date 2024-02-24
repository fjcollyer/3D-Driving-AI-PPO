# 3D Driving AI: Proximal Policy Optimization

## Website
[https://driving-ai.netlify.app/](https://driving-ai.netlify.app/)

## Preview
![Preview of project UI](preview.gif)

## Description / Summary
This project utilizes Proximal Policy Optimization to develop a model capable of controlling a car around a racetrack in a 3D web application. On the live site, you can observe the model in action and control the car yourself. You can also clone the repository to quickly start running the pre-trained model or begin training your own. This provides a straightforward way to dive into the project's main functionalities.

## Table of Contents**

1. [Getting Started](#getting-started)
   - [Prerequisites](#1-prerequisites)
   - [Clone the Repository](#2-clone-the-repository)
   - [Install Dependencies](#3-install-dependencies)
2. [Running the Project in Training Mode](#running-the-project-in-training-mode)
   - [Start "app.py"](#1-start-apppy)
   - [Start Training](#2-start-training)
   - [Monitor Performance](#3-monitor-performance)
   - [Stop Training](#4-stop-training)
   - [Prepare the Newly Trained Model](#5-how-to-prepare-the-newly-trained-model-to-be-used-in-the-web-app)
3. [Running the Web App with Pre-trained Models](#running-the-web-app-with-pre-trained-models)
4. [Building the Web App for Deployment](#building-the-web-app-for-deployment)

<span id="getting-started" style="margin-top: 20px;"></span>
## Getting started

### 1. Prerequisites

- Python3 (3.11.7)
- pip3 (23.2.1)
- Node.js (v20.10.0)
- npm (10.3.0)

### 2. Clone the Repository
```bash
git clone https://github.com/fjcollyer/3D-Driving-AI-PPO.git &&
cd 3D-Driving-AI-PPO
```

### 3. Install dependencies
```bash
cd ui &&
npm i &&
cd .. &&
pip3 install -r requirements.txt
```

## Running the project in training mode

### 1. Start "app.py"
```bash
python3 app.py
```
You will then be prompted:<br>
"Would you like to create a production build of the UI app? (y/n)".<br> 
Enter "n" to continue.<br>
<br>
You will then be prompted:<br>
"Would you like to run the app in training mode? (y/n)".<br>
Enter "y" to start the web app in training mode and run the Flask API where the model is trained.

### 2. Start training
To start training open the web app and press the "START" button. The web app will call the Flask API passing the state and the API will respond with the models actions.<br>
All the training logic is handled in the Flask app with Tensorflow.<br>
<br>
To increase training speed simply run the web app on multiple active browser tabs. The API is designed to handle multiple instances of the web app making requests.<br>

### 3. Monitor performance
During training every 20 games the average track completion percentage over the past 20 games is plotted to "statistics.png" and the model is saved to "ai/saved_ppo_tf_models".

### 4. Stop training
Press Ctrl+C in the terminal where the app is running. The application is set to gracefully shut down.

### 5. How to prepare the newly trained model to be used in the web app
#### a. Identify the model you would like to prepare
In "ai/saved_ppo_tf_models" the naming convention of the saved models is: {type}/{type}\_episodes\_{num\_episodes\_completed}\_avg\_{avg\_track\_completion\_%}.

#### b. Convert the model from Tensorflow format to Tensorflow.js format
```bash
python3 convert_tf_to_tfjs.py
```

You will then be prompted:<br>
"Enter the episode number of the models you are targeting:".<br>
Enter the number {num_episodes_completed} that you identified at the last step.<br>
<br>
You will then be prompted:<br>
"Would you like to save the converted models to './ui/static/tfjs_models' as well? (y/n):".<br>
Enter "y".

#### c. Update the web app config
In "ui/static/common-with-flask-config.json" change the number to your models {num_episodes_completed} in the "path_to_tfjs_actor" and "path_to_tfjs_critic" fields.

## Running the web app with pre-trained models

### 1. Start "app.py"
```bash
python3 app.py
```
You will then be prompted:<br>
"Would you like to create a production build of the UI app? (y/n)".<br>
Enter "n" to continue.<br>
<br>
You will then be prompted:<br>
"Would you like to run the app in training mode? (y/n)".<br>
Enter "n" to start the web app using the pre-trained models.

### 2. That's it
The web app uses the models specified in "ui/static/common-with-flask-config.json" for the beginner, intermediate and advanced modes.

## Building the web app for deployment

### 1. Start "app.py"
```bash
python3 app.py
```
You will then be prompted:<br>
"Would you like to create a production build of the UI app? (y/n)".<br>
Enter "y".

### 2. That's it
You can upload "ui/dist/" to a hosting service.