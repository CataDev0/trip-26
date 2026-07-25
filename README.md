# Trip Tracker V1

## Architecture

**Backend** - [Express](https://expressjs.com/), [SQLite](https://sqlite.org/)

**Frontend** - [Svelte](https://svelte.dev/), [Leaflet](https://leafletjs.com/)

**Android App** - [Capacitor](https://capacitorjs.com/)

## Description

Trip Tracker is a full stack application that tracks your roadtrip or hikes using your phone.

![alt text](image.png)
![alt text](image-1.png)

## Features

- Website for sharing and viewing trips and editing locations and GPS traces
- Mark locations as visited
- Automatically pulls wikipedia images for locations
- Current speed and Speed limit in real time
- Username & Password login required one time to start tracking and editing
  - Saved to device

## Setup Guide

1. ### Clone Repo

   ```bash
    git clone https://github.com/CataDev0/trip-26.git && cd trip-26/
    ```

1. ### Create environment file

    ```bash
    cp .env.example .env
    ```

1. ### Edit the environment file with your desired username and password

    \* *For logging into the tracker suite*

    ```bash
    nano .env
    ```

    **Optionally:** Add [HERE](https://docs.here.com/geocoding-and-search/docs/get-started-with-here-geocoding-and-search-api-v7) API key for speed limit functionality - Using the Geocoding and Search API

1. ### Install dependencies and run vite build

    ```bash
    npm i && npm run build
    ```

   ### *Build the Android app*

    1.

    ```bash
    cd frontend && npx cap sync android
    ```

    1. Run Android Studio and open `trip-26/frontend/android` folder
    1. Run build - *Assemble 'app' Run Configuration*
    1. Connect your phone with USB Debugging or WiFi Debugging enabled
    1. Run the app on your phone

    **The app should now be installed and signed by Android Studio**

1. ### Run the backend server using node.js

    **Example using systemd unit:**

    Make a new unit file

    ```bash
    sudo nano /etc/systemd/system/triptracker.service`
    ```

    Replace `YOURUSER` with your `$USER`

    And correct WorkingDirectory pointing to the cloned repository folder

    ```systemd
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

    ```bash
    sudo systemctl daemon-reload
    ```

    Enable autostart and start the service

    ```bash
    sudo systemctl enable triptracker && sudo systemctl start triptracker
    ```

    Reach the app at <http://localhost:3000/>

## Contribute

Contributions are welcome and are important to polish the software

### Suggested contributions

- iOS app support with capacitor
  - I dont have iOS, nor do I know how to build and sign an iOS app
- Group trips together
  - Option to filter based on group trips
- Better editing tools
  - Clean up messy traces etc.
- Better accuracy
  - Background tracking
- Plan trips / Route planning
  - Use an API? Or make a complicated route planning tool
