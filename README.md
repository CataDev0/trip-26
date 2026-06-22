# Trip Tracker V1 
## Architecture

**Backend** - Express, SQLite

**Frontend** - Svelte, Leaflet

**Android App** - Capacitor

## Description

Trip Tracker is a full stack application that tracks your roadtrip or hikes using your phone.

## Features

- Website for sharing and viewing trips and editing locations and GPS traces
- Mark locations as visited
- Automatically pulls wikipedia images for locations
- Current speed and Speed limit in real time
- Username & Password login required one time to start tracking and editing
    - Saved to device

## Setup Guide
1. ### Clone Repo
    
   ```
    git clone https://github.com/CataDev0/trip-26.git && cd trip-26/
    ```
1. ### Create environment file
    ```
    cp .env.example .env
    ```
1.  ### Edit the environment file with your desired username and password
    \* *For logging into the tracker*
    ```
    nano .env
    ```

    **Optionally:** Add [HERE](https://docs.here.com/geocoding-and-search/docs/get-started-with-here-geocoding-and-search-api-v7) API key for speed limit functionality - Using the Geocoding and Search API


1.  ### Install dependencies and run vite build:
    ```
    npm i && npm run build
    ```
    
    ### *Build the Android app*
    1. 
        ``` 
        cd frontend && npx cap sync android
        ```
    1. Run Android Studio and open `trip-26/frontend/android` folder
    1. Run build - *Assemble 'app' Run Configuration*
    1. Connect your phone with USB Debugging or WiFi Debugging enabled
    1. Run the app on your phone

    **The app should now be installed and signed by Android Studio**

5. ### Run the backend server using node.js
    
    **Example using systemd unit:**
    
    Make a new unit file
    ```
    sudo nano /etc/systemd/system/triptracker.service`
    ```
    Replace `YOURUSER` with your `$USER`
    
    And correct WorkingDirectory pointing to the cloned repository folder
    ```
    [Unit]
    Description=Trip Tracker Node.js App
    After=network.target

    [Service]
    Type=simple
    User=YOURUSER
    WorkingDirectory=/home/YOURUSER/trip-26
    # Use the absolute path to your node executable
    # You can find it by running `which node`
    ExecStart=/usr/bin/node server.js
    Restart=on-failure
    RestartSec=10
    Environment=NODE_ENV=production
    Environment=PORT=3000

    [Install]
    WantedBy=multi-user.target
    ```
    Reload systemd units
    ```
    sudo systemctl daemon-reload
    ```
    Enable autostart and start the service
    ```
    sudo systemctl enable triptracker && sudo systemctl start triptracker
    ```
    
    Reach the app at http://localhost:3000/