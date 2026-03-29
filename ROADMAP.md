# Project Roadmap: AI Co-Pilot for Motorcyclists

This roadmap breaks down the development of the screen-free, location-based audio social network into testable, incremental milestones. Each phase is designed to be verifiable before moving to the next.

## Phase 1: Interactive Dashboard & UI Foundation
*Goal: Provide a visual environment for simulated testing.*
- [ ] **Step 1.1: Map Integration**
    - Integrate Mapbox or Google Maps into the Next.js frontend.
    - Implement basic zoom, pan, and coordinate display.
    - *Test: Verify maps load and respond to interaction.*
- [ ] **Step 1.2: Simulator Controls**
    - Create a "Simulated Rider" marker.
    - Add UI to manually set the rider's position or drag it on the map.
    - *Test: Rider position updates correctly in app state.*
- [ ] **Step 1.3: Message/Hazard UI**
    - Create a "Drop Pin" mode to place messages on the map.
    - Basic modal to input message text and type (Hazard, Friend, Scenic).
    - *Test: Pins are saved in local state and rendered on the map.*

## Phase 2: Cloudflare Backend & AI Tagging
*Goal: Connect the frontend to the Cloudflare ecosystem.*
- [ ] **Step 2.1: Cloudflare Workers Setup**
    - Initialize a Worker to handle message storage (D1 or KV).
    - Create endpoint specifically for posting and fetching pins.
    - *Test: `POST /api/pins` saves a pin and `GET /api/pins` retrieves it.*
- [ ] **Step 2.2: AI Content Tagging (Workers AI)**
    - Implement a Llama 3 prompt to automatically categorize messages when they are dropped.
    - *Test: Dropping a "Big pothole on Main St" is auto-tagged as "Hazard".*
- [ ] **Step 2.3: Basic Proximity Check**
    - A simple logic in the Worker or Frontend to detect when the rider is "close" to a pin.
    - *Test: Console log when the rider marker is within 50m of a pin.*

## Phase 3: Premium Audio Experience (ElevenLabs)
*Goal: Bring the "screen-free" aspect to life.*
- [ ] **Step 3.1: ElevenLabs Integration**
    - Connect the ElevenLabs API to the project.
    - Implement a utility to generate audio from a pin's text.
    - *Test: Audio plays in the browser when manually requested.*
- [ ] **Step 3.2: Dynamic Summarization (Cloudflare Agents)**
    - Create a "Summary Engine" using Cloudflare Workers AI.
    - It should combine multiple messages in a zone into a single 5-second script.
    - *Test: Passing 3 hazard messages results in a single coherent script.*
- [ ] **Step 3.3: Voice Cloning for Social**
    - (Optional/MVP) Set up a few preset "Cloned Voices" for testing simulated friends.
    - *Test: Different messages play in different voices.*

## Phase 4: Geographic Intelligence & Simulation Loop
*Goal: Automate the experience for the presentation.*
- [ ] **Step 4.1: Geofencing via Durable Objects**
    - Use Cloudflare Durable Objects to maintain the state of active "Zones".
    - Track "Entering" and "Exiting" events for the rider.
    - *Test: UI visualizes zones and highlights them when the rider is inside.*
- [ ] **Step 4.2: "Start Ride" Simulation**
    - Implement path interpolation to move the rider along a "Route".
    - Automatically trigger the Audio engine when entering a zone or passing a message.
    - *Test: Complete hands-free simulation where audio plays as the markers move.*

## Phase 5: Final Polish & Demo Capture
*Goal: High-fidelity presentation materials.*
- [ ] **Step 5.1: Simulation Dashboard Refinement**
    - Add "Audio Ducking" visualization (e.g., music wave visualizer that shrinks during AI speech).
    - Polished dark-mode UI for the dashboard.
- [ ] **Step 5.2: Demo Recording & Video Editing**
    - Screen record the simulation.
    - Overlay audio with real riding footage.
