# Implementation Plan: AI Co-Pilot for Motorcyclists

This plan breaks down the development into logical stages. **I will only work on ONE step at a time.** After completing a step, I will wait for your verification before proceeding to the next.

## Progress Overview
| Stage | Description | Status |
| :--- | :--- | :--- |
| **Stage 1** | UI Foundation & Map Simulation | 🟡 READY |
| **Stage 2** | Cloudflare Backend & AI Tagging | ⚪️ PENDING |
| **Stage 3** | Audio Engine & ElevenLabs | ⚪️ PENDING |
| **Stage 4** | Interaction Logic & Geofencing | ⚪️ PENDING |
| **Stage 5** | Final Polish & Demo Capture | ⚪️ PENDING |

---

## Stage 1: UI Foundation & Map Simulation
*Goal: Create a visual environment where we can simulate a ride.*

- [ ] **Step 1.1: Map Integration**
    - Install dependencies (React-Map-GL or similar).
    - Set up a full-screen map in `app/page.tsx`.
    - *Verification: Does the map render with a dark theme?*
- [ ] **Step 1.2: Simulator Rider Marker**
    - Create a custom "Rider" marker on the map.
    - Implement a sidebar to show current coordinates.
    - *Verification: Can we see the rider marker and its coordinates?*
- [ ] **Step 1.3: Manual Position Control**
    - Click-to-move or draggable rider marker.
    - *Verification: Does the rider marker move when clicked/dragged?*
- [ ] **Step 1.4: Message/Hazard Pin System**
    - "Drop Pin" mode to place messages on the map.
    - Store pins in local React state for now.
    - *Verification: Can we drop "Hazard" and "Friend" pins and see them on the map?*

---

## Stage 2: Cloudflare Backend & AI Tagging
*Goal: Persistent storage and AI-powered metadata.*

- [ ] **Step 2.1: Cloudflare Worker Setup**
    - Create a Worker for pin storage (D1 or KV).
    - *Verification: Can we hit the API and get an empty list of pins?*
- [ ] **Step 2.2: AI Content Classifier**
    - Integrate Workers AI (Llama 3) to categorize pin text.
    - *Verification: Does "Large rock in the road" get tagged as "HAZARD"?*
- [ ] **Step 2.3: API Integration**
    - Connect Frontend "Drop Pin" to the backend.
    - *Verification: Do pins persist after a page refresh?*

---

## Stage 3: Audio Engine & ElevenLabs
*Goal: The voice of the AI Co-Pilot.*

- [ ] **Step 3.1: ElevenLabs TTS Implementation**
    - Basic "Speak" button on pins to test ElevenLabs.
    - *Verification: Do we hear the premium audio when clicking a pin?*
- [ ] **Step 3.2: Dynamic Scripting**
    - Cloudflare Agent to summarize multiple pins into one script.
    - *Verification: If 3 pins are nearby, does the AI generate a single summary script?*

---

## Stage 4: Interaction Logic & Geofencing
*Goal: "Hands-free" triggers.*

- [ ] **Step 4.1: Proximity Detection**
    - Logic to detect when Rider is within X meters of a Pin or Zone.
    - *Verification: Does the UI glow or highlight when the rider is "entering" a zone?*
- [ ] **Step 4.2: Automated Trigger Loop**
    - Automatically trigger the Audio Engine when proximity criteria are met.
    - *Verification: Does audio play automatically as I drag the rider marker near a pin?*

---

## Stage 5: Final Polish & Demo Capture
*Goal: Premium look and feel.*

- [ ] **Step 5.1: Music Ducking Visualization**
    - Visual "Spotify-like" wave that ducks when AI speaks.
- [ ] **Step 5.2: Recording Dashboard**
    - Refine the UI for the final demo recording.
