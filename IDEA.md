# Project Overview

## The Elevator Pitch
This project is a screen-free, location-based audio social network for motorcyclists and travelers. Instead of requiring users to interact with a screen or managing audio clutter, the system acts as an AI Co-Pilot that lives in the user's helmet. It seamlessly ducks background music to dynamically summarize local hazards, filter out noise, and play geolocated voice messages from friends in their actual voices as they ride past specific locations.

## Technical Architecture

### Cloudflare (Backend & Intelligence)
*   **Cloudflare Workers:** The core serverless backend handling API requests, GPS coordinate tracking, and data routing between the frontend and AI models.
*   **Cloudflare Workers AI (Llama 3):** Powers the tagging system. When a message is dropped, Workers AI categorizes it (e.g., Hazard, Personal, Joke, Scenic).
*   **Cloudflare Vectorize:** A vector database used to cluster similar reports. For example, multiple reports of road debris are grouped into a single hazard zone.
*   **Cloudflare Durable Objects:** Manages geographic "Zones". It maintains the state of all messages in a specific radius and triggers summary events when a user enters the zone.
*   **Cloudflare Agents:** Acts as the curator. When a user enters a zone, the Agent fetches relevant messages based on user preferences and generates a custom audio summary script.

### ElevenLabs (Voice & Delivery)
*   **Text-to-Speech (TTS):** Delivers the AI Co-Pilot's generated summaries using premium, natural-sounding voices (ElevenLabs) engineered to be clear even over wind noise.
*   **Actual Voice Playback:** Enhances the social experience by playing original voice recordings from friends, providing a deeply personal and authentic connection during the journey.

## Core Features
*   **Audio Ducking:** Automatically lowers music volume (Spotify/Apple Music) to play AI summaries and friend messages before fading it back up.
*   **Smart AI Filtering:** Allows users to customize their experience by filtering for specific content types, such as Hazards Only or Friends Only.
*   **Hazard Summarization:** Consolidates multiple reports into concise, 5-second AI voice warnings to prevent information overload.

## MVP Implementation Phases
For a full breakdown, see [ROADMAP.md](./ROADMAP.md).

### Phase 1: Interactive Simulation UI
*   [ ] **Map Foundation**: Integrate a map (Mapbox/Google) and handle center/zoom state.
*   [ ] **Rider Simulator**: A draggable marker that represents the user's GPS position.
*   [ ] **Pin System**: UI to manually drop location-based messages with text and author name.
*   *Verification: Can we drop a pin and move the rider near it?*

### Phase 2: Cloudflare Intelligence Layer
*   [ ] **Storage Worker**: API to persist and retrieve pins from Cloudflare D1/KV.
*   [ ] **AI Classifier**: Use Workers AI (Llama 3) to automatically tag pins as "Hazard", "Friend", etc.
*   [ ] **Proximity Logic**: Implement geofencing to detect when a rider is within a specific radius of a pin.
*   *Verification: Does the system recognize when a "Hazard" pin is nearby?*

### Phase 3: Premium Audio Delivery
*   [ ] **ElevenLabs TTS**: Convert message text into clear, premium audio in the browser.
*   [ ] **Agent Summarization**: Use Cloudflare Agents to group multiple nearby hazards into a single 5-second summary.
*   [ ] **Social Audio Clips**: Implement recording and storage for friend messages to play back their actual voice.
*   *Verification: Does the correct voice play when the rider "hits" a geofence?*

### Phase 4: Full Simulation & Recording
*   [ ] **Automated Routes**: Create a "Start Ride" feature that slides the rider marker along a path.
*   [ ] **Music Ducking**: Implement a visual representation of music lowering when the AI speaks.
*   [ ] **Demo Capture**: Record the simulation for the final presentation.
*   *Verification: Can we record a 60-second "perfect ride" simulation?*

## Presentation Strategy
*   **Web Simulation Recording:** Capture the simulation dashboard in action.
*   **Contextual Editing:** Combine simulation footage with real riding video to demonstrate the real-world application.
*   **Audio Overlay:** Use ElevenLabs generated audio over riding footage to showcase the end-user experience.
*   **Performance Focus:** Highlight the speed of Cloudflare and ElevenLabs in processing location data for real-time delivery.