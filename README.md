# 3D Driving AI: Proximal Policy Optimization

## Website
[https://driving-ai.netlify.app/](https://driving-ai.netlify.app/)

## Preview
![Preview of project UI](preview.gif)

## Description / Summary
This project utilizes Proximal Policy Optimization to develop a model capable of controlling a car around a racetrack in a custom 3D web application built with Three.js. On the live site, you can observe the model in action and control the car yourself. You can also clone the repository to quickly start running the pre-trained model or begin training your own. This provides a straightforward way to dive into the project's main functionalities.

## Table of Contents

1. [Architecture and Interation](#aarchitecture-and-integration) 
2. [Getting Started](#getting-started)
3. [Running the Project in Training Mode](#running-the-project-in-training-mode)
4. [Running the Web App with Pre-trained Models](#running-the-web-app-with-pre-trained-models)
5. [Building the Web App for Deployment](#building-the-web-app-for-deployment)

## Architecture and Integration

This project is an integration of two main components: a 3D web application and a Python Flask application equipped with TensorFlow for model training, utilizing Proximal Policy Optimization (PPO) techniques.

### Web Application
The 3D web application, developed using Three.js, presents a user interface where a car navigates a racetrack. It operates in two distinct modes:

- **Training Mode:** Here, the web app interacts dynamically with the Flask API, making around 4 API calls per second to send data about the car's current state. This data includes the car's distance from the track edges in seven directions, determined through raycasting. Based on this input, the Flask API responds with actions derived from the Proximal Policy Optimization (PPO) model. To enhance the speed of training, the web app is designed to support multiple active training sessions across different browser tabs. This feature was utilized during development, where four active tabs were opened simultaneously to expedite the training process.
- **Normal Mode:** In this mode, the web app directly uses the models previously trained in Training Mode using TensorFlow.js. This allows for a seamless transition from training to implementation, showcasing the capabilities of the models without the need for real-time interaction with the Flask app.

### Python Flask TensorFlow App
The backend is powered by a Python Flask application, integrating TensorFlow to facilitate model training with Proximal Policy Optimization (PPO). It processes incoming API requests from the web application, interpreting the car's state to determine its next actions. This Flask application is pivotal in managing training sessions, including scheduling pauses for data processing and model improvement.

### Model Conversion and Integration
To transition models from TensorFlow to TensorFlow.js, a conversion script is employed. This script transforms models saved by the Flask application into a format compatible with TensorFlow.js, utilizing the conversion tool provided by TensorFlow.js, enabling their execution directly in the browser.

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
<br>

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
<br>
<br>

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
<br>
<br>

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