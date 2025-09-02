
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const { VertexAI } = require("@google-cloud/vertexai");

// Initialize Firebase Admin SDK and Firestore
admin.initializeApp();
const db = admin.firestore();

// --- Configuration for AI & Location ---
const LOCATION = "europe-west1"; // Belgium

// Initialize Vertex AI with the specified location
const vertex_ai = new VertexAI({ project: process.env.GCLOUD_PROJECT, location: LOCATION });

// Instantiate the cost-effective model we chose
const geminiModel = vertex_ai.preview.getGenerativeModel({
    model: "gemini-2.5-flash-lite",
});

// --- Cloud Function: getIngredientsFromImage ---
exports.getIngredientsFromImage = functions.region(LOCATION).https.onCall(async (data, context) => {
    if (!data.image) {
        throw new functions.https.HttpsError('invalid-argument', 'The function must be called with an "image" argument containing a base64 encoded image.');
    }

    const imagePart = { inlineData: { data: data.image, mimeType: 'image/jpeg' } };
    const prompt = "List all edible ingredients and foodstuffs in this image. Respond ONLY with a comma-separated list without any titles or other explanations. Example: Milk, Tomato, Cheese, Bread.";

    try {
        const result = await geminiModel.generateContent([prompt, imagePart]);
        const response = result.response;

        // Safety check for blocking
        if (response.candidates && response.candidates[0].finishReason === 'SAFETY') {
            console.warn("Image recognition blocked for safety reasons.", response.candidates[0].safetyRatings);
            throw new functions.https.HttpsError('permission-denied', "The image was blocked for safety reasons. Please use a different image.", { safetyRatings: response.candidates[0].safetyRatings });
        }

        if (!response.candidates || response.candidates.length === 0 || !response.candidates[0].content.parts || response.candidates[0].content.parts.length === 0) {
            console.error("No valid content returned from Vertex AI (vision). Full response:", JSON.stringify(response, null, 2));
            throw new functions.https.HttpsError('internal', "The AI failed to provide a response for the image.", { reason: "No content returned from model." });
        }

        const textResponse = response.candidates[0].content.parts[0].text;
        return { ingredients: textResponse };

    } catch (error) {
        console.error("Error from Vertex AI (vision):", error);
        if (error instanceof functions.https.HttpsError) {
            throw error; // Re-throw HttpsError directly
        }
        // For other types of errors, wrap them in a generic HttpsError
        throw new functions.https.HttpsError('internal', "An unexpected error occurred while processing the image with Vertex AI. Please check the logs.", { originalError: error.message });
    }
});


// --- Cloud Function: generateRecipe ---
exports.generateRecipe = functions.region(LOCATION).https.onCall(async (data, context) => {
    const ingredients = data.ingredients;
    if (!ingredients || !Array.isArray(ingredients) || ingredients.length === 0) {
        throw new functions.https.HttpsError('invalid-argument', 'The function must be called with an "ingredients" array containing at least one item.');
    }

    // Create a canonical key by sorting ingredients alphabetically
    const ingredientKey = [...ingredients].sort().join(',');
    const recipeRef = db.collection('recipes').doc(ingredientKey);

    try {
        // 1. Check if a recipe with this exact ingredient key already exists
        const doc = await recipeRef.get();
        if (doc.exists) {
            console.log("Found existing recipe in Firestore.");
            return doc.data(); // Return the cached recipe
        }

        // 2. If not found, generate a new one
        console.log("No existing recipe found. Generating a new one.");
        const personaPrompt = `
            You are an experienced and warm-hearted Finnish chef-grandfather, mentored by the great Jacques Pépin. You share your wisdom with passion and approachability. Your goal is to inspire and guide, creating delicious, practical recipes that respect the ingredients.

            Your task is to create a recipe from the following ingredients: ${ingredients.join(", ")}.

            Respond ONLY in a valid JSON format, with no other text, comments, or markdown. The JSON object must contain:
            - "title": A catchy, Finnish name for the recipe.
            - "desc": A short, appealing description of the recipe (max 2-3 sentences).
            - "used": An array of the provided ingredients that you used.
            - "needs": An array of other essential ingredients needed for the recipe.
            - "instr": An array of clear, numbered preparation steps.
            - "tags": An object with the following fields: "cuisine" (e.g., Italian, Scandinavian), "meal" (e.g., Breakfast, Dinner), "diet" (e.g., Vegetarian, Vegan, Gluten-free), "time" (e.g., "<30min", "30-60min", ">60min").
            - "search_keys": An array of all ingredients used in the recipe ("used" and "needs") in a simple, singular, lowercase format (e.g., "tomato", "onion", "beef").
        `;

        const result = await geminiModel.generateContent(personaPrompt);
        const response = result.response;
        
        // Safety check for the response structure
        if (!response.candidates || response.candidates.length === 0 || !response.candidates[0].content.parts || response.candidates[0].content.parts.length === 0) {
            console.error("No valid content returned from Vertex AI (recipe). Response:", response);
            throw new functions.https.HttpsError('internal', "The AI failed to generate a recipe response.");
        }

        // --- Robust JSON Parsing ---
        const rawResponse = response.candidates[0].content.parts[0].text;
        let jsonString = rawResponse;

        // Find the start and end of the JSON object, which is more reliable than simple replacement.
        const jsonStart = jsonString.indexOf('{');
        const jsonEnd = jsonString.lastIndexOf('}');

        if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
            jsonString = jsonString.substring(jsonStart, jsonEnd + 1);
        } else {
             // If we can't find a JSON object, it's a critical failure.
             console.error("Could not find a valid JSON object in the model's response. Raw response:", rawResponse);
             throw new functions.https.HttpsError('internal', "Failed to parse the recipe from the AI's response. The AI returned a non-JSON response.");
        }

        let recipeData;
        try {
            recipeData = JSON.parse(jsonString);
        } catch (parseError) {
            console.error("Error parsing JSON from the model's response:", parseError);
            console.error("Raw JSON string that failed to parse:", jsonString);
            // This error is crucial for debugging, but we send a user-friendly message to the client.
            throw new functions.https.HttpsError('internal', "There was an issue parsing the generated recipe. Please try again.", parseError.message);
        }
        // --- End of Robust JSON Parsing ---

        // 3. Add our own metadata and save to Firestore
        recipeData.key = ingredientKey;
        recipeData.added = new Date().toISOString();
        // Add a server-side timestamp for data analysis
        recipeData.createdAt = admin.firestore.FieldValue.serverTimestamp();

        // Validate that essential fields exist before saving
        const requiredFields = ['title', 'desc', 'used', 'needs', 'instr', 'tags', 'search_keys'];
        for (const field of requiredFields) {
            if (!recipeData.hasOwnProperty(field)) {
                console.error(`Generated recipe is missing required field: ${field}.`, recipeData);
                throw new functions.https.HttpsError('internal', `The generated recipe was incomplete and missed the '${field}' field.`);
            }
        }

        await recipeRef.set(recipeData);
        console.log("New recipe saved to Firestore with key:", ingredientKey);

        return recipeData;

    } catch (error) {
        console.error("Error in generateRecipe function:", error);
        // Check if it's already an HttpsError, if not, wrap it.
        if (error instanceof functions.https.HttpsError) {
            throw error;
        } else {
            throw new functions.https.HttpsError('internal', "An unexpected error occurred while generating the recipe.", error.message);
        }
    }
});
