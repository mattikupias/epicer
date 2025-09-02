# epiceR Application Blueprint

## Overview

epiceR is an intelligent kitchen assistant designed to help users create delicious meals from the ingredients they have on hand. The application uses AI to generate recipes, with a focus on ease of use, creativity, and minimizing food waste. The long-term vision is to create a global, multi-lingual cooking platform with deep integrations into the food ecosystem.

## Architecture & Design (Version 1.1)

This document outlines the initial architecture, designed for scalability, performance, and cost-efficiency.

### Core Technologies

-   **Frontend:** HTML, CSS, JavaScript (ES Modules)
-   **Backend:** Firebase Cloud Functions
-   **Database:** Cloud Firestore
-   **AI Model:** Google Gemini (`gemini-2.5-flash-lite`)

### Data Structure: Firestore Collections

#### 1. `recipes` Collection

This is the primary collection for storing all generated recipes. The structure is optimized for low storage cost and efficient querying.

-   **Document ID:** A "canonical key" created by sorting the primary ingredients alphabetically (e.g., `basil,cheese,tomato`).
-   **Document Fields:**
    ```json
    {
      "title": "Herkullinen tomaattipasta",
      "desc": "Nopea ja maukas pasta arkeen.",
      "used": ["tomaatti", "juusto", "basilika"],
      "needs": ["oliiviöljy", "valkosipuli"],
      "instr": ["Keitä pasta...", "Lisää kastike..."],
      "tags": {
        "cuisine": "Italian",
        "meal": "Dinner",
        "diet": "Vegetarian",
        "time": "<30min"
      },
      "key": "basilika,juusto,tomaatti",
      "added": "2024-10-27T10:00:00Z",
      "search_keys": ["tomaatti", "juusto", "basilika", "oliiviöljy", "valkosipuli"],
      "createdAt": "2024-10-27T10:00:00Z"
    }
    ```

#### 2. `ingredients_dictionary` Collection

This collection will be populated in Phase 2. It will serve as a centralized, multi-lingual dictionary for all ingredients, enabling internationalization and advanced searching, which is the foundation for future grocery app integrations.

-   **Document ID:** A language-agnostic ID (e.g., `ingredient_tomato`).
-   **Document Fields:**
    ```json
    {
      "name_fi": "tomaatti",
      "name_sv": "tomat",
      "name_en": "tomato",
      "name_de": "Tomate"
    }
    ```

### Application Flow & Error Handling

1.  **User Input:** User provides ingredients via text or image.
2.  **Image Recognition (`getIngredientsFromImage`):** The `gemini-2.5-flash-lite` model analyzes the image and returns a comma-separated list of ingredients. The function includes safety checks for the AI response.
3.  **Recipe Generation (`generateRecipe`):**
    a.  A canonical `ingredientKey` is created from the user's list.
    b.  Firestore is queried to see if a recipe with this key already exists. If so, it's returned immediately.
    c.  If no recipe is found, a detailed prompt is sent to the `gemini-2.5-flash-lite` model.
    d.  **Robust JSON Parsing:** The function expects a JSON response and will safely parse it, cleaning up any extraneous markdown or text from the model's response. This prevents crashes from malformed AI output.
    e.  **Data Validation:** Before saving, the function validates that the generated recipe object contains all the necessary fields (`title`, `desc`, `instr`, etc.).
    f.  The new, validated recipe is saved to Firestore and returned to the user.

## Current Development Plan

### Phase 1: Core Functionality & Robustness (Completed)

-   **Goal:** Implement the core logic of generating recipes from ingredients, checking the database first, and saving new recipes, while ensuring the application is resilient to common errors.
-   **Actions:**
    -   [x] Implemented `getIngredientsFromImage` Cloud Function.
    -   [x] Implemented `generateRecipe` Cloud Function.
    -   [x] Set up Firestore `recipes` collection.
    -   [x] Deployed the core application.
    -   [x] **Fixed:** Implemented robust JSON parsing and data validation in the backend to prevent crashes and ensure data integrity.
    -   [x] **Confirmed:** Set the AI model to `gemini-2.5-flash-lite` for optimal cost and performance, as per our research.

### Phase 2: Build the Ingredients Dictionary (Queued)

-   **Goal:** Programmatically populate the `ingredients_dictionary` collection. This is the foundational step for enabling multi-language support and future integrations with grocery store apps (e.g., Wolt, S-Group).
-   **Action:** Create a new, manually-triggered Cloud Function to iterate through all existing recipes in the `recipes` collection and create a unique dictionary entry for each ingredient in the `search_keys` array.

### Phase 3: Human-in-the-Loop UI (Queued)

-   **Goal:** Implement a feedback system to allow users to verify or correct AI-identified ingredients.
-   **Action:** This will involve frontend UI changes and backend logic to update the `ingredients_dictionary` based on user feedback, continuously improving its accuracy.
