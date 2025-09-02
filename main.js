
document.addEventListener('DOMContentLoaded', () => {
    // --- Firebase Initialization ---
    const firebaseConfig = {
        apiKey: "AIzaSyCsbp92-ZT6B1KKkNzg60WGM52oahbmuaI",
        authDomain: "epicer-ai-kitchen.firebaseapp.com",
        projectId: "epicer-ai-kitchen",
        storageBucket: "epicer-ai-kitchen.appspot.com",
        messagingSenderId: "1087058768635",
        appId: "1:1087058768635:web:32242e820a3640f8a5365e"
    };

    const app = firebase.initializeApp(firebaseConfig);
    const functions = app.functions("europe-west1");

    // --- Callable Cloud Function References ---
    const getIngredientsFromImage = functions.httpsCallable('getIngredientsFromImage');
    const generateRecipe = functions.httpsCallable('generateRecipe');

    // --- DOM Element References ---
    const inputContainer = document.getElementById('input-container');
    const imageUpload = document.getElementById('image-upload');
    const manualIngredientsInput = document.getElementById('manual-ingredients-input');
    const manualIngredientsSubmit = document.getElementById('manual-ingredients-submit');

    const ingredientsConfirmationContainer = document.getElementById('ingredients-confirmation-container');
    const ingredientsListEditor = document.getElementById('ingredients-list-editor');
    const addIngredientInput = document.getElementById('add-ingredient-input');
    const addIngredientBtn = document.getElementById('add-ingredient-btn');
    const generateRecipeBtn = document.getElementById('generate-recipe-btn');

    const recipeContainer = document.getElementById('recipe-container');
    const recipeContent = document.getElementById('recipe-content');
    const loadingContainer = document.getElementById('loading-container');
    const loadingText = document.getElementById('loading-text');

    // --- State Management ---
    let currentIngredients = [];

    // --- UI Update Functions ---
    const showLoading = (text) => {
        loadingText.textContent = text;
        loadingContainer.classList.remove('hidden');
    };
    const hideLoading = () => loadingContainer.classList.add('hidden');
    const switchToIngredientConfirmation = () => {
        inputContainer.classList.add('hidden');
        recipeContainer.classList.add('hidden');
        ingredientsConfirmationContainer.classList.remove('hidden');
    };
    const switchToRecipeView = () => {
        ingredientsConfirmationContainer.classList.add('hidden');
        recipeContainer.classList.remove('hidden');
    };

    // --- Core Logic (Now using Cloud Functions) ---

    // 1. Handle Image Upload
    imageUpload.addEventListener('change', async (event) => {
        const file = event.target.files[0];
        if (!file) return;

        showLoading('Tunnistetaan aineksia kuvasta...');

        try {
            const base64Image = await fileToBase64(file);
            
            const result = await getIngredientsFromImage({ image: base64Image });
            const textResponse = result.data.ingredients;

            if (!textResponse || textResponse.trim() === '') {
                alert("The AI could not identify any ingredients in the image. Please try again or enter them manually.");
                return;
            }
            
            currentIngredients = textResponse.split(',').map(item => item.trim()).filter(Boolean);
            updateIngredientsEditor();
            switchToIngredientConfirmation();
        } catch (error) {
            console.error("Error calling getIngredientsFromImage function:", error);
            // Provide a more detailed error message to the user.
            const details = error.details ? ` Details: ${JSON.stringify(error.details)}` : '';
            alert(`An error occurred during image recognition: ${error.message}${details}`);
        } finally {
            hideLoading();
        }
    });

    // 2. Handle Manual Ingredient Submission
    manualIngredientsSubmit.addEventListener('click', () => {
        const ingredients = manualIngredientsInput.value;
        if (!ingredients.trim()) {
            alert("Please enter at least one ingredient.");
            return;
        }
        currentIngredients = ingredients.split(',').map(item => item.trim()).filter(Boolean);
        updateIngredientsEditor();
        switchToIngredientConfirmation();
    });

    // 3. Generate Recipe
    generateRecipeBtn.addEventListener('click', async () => {
        if (currentIngredients.length === 0) {
            alert("Please add ingredients before generating a recipe.");
            return;
        }

        showLoading('Creating a delicious recipe for you...');

        try {
            const result = await generateRecipe({ ingredients: currentIngredients });
            const recipe = result.data; // The callable function returns the JSON object directly
            displayRecipe(recipe);
            switchToRecipeView();

        } catch (error) {
            console.error("Error calling generateRecipe function:", error);
            const details = error.details ? ` Details: ${JSON.stringify(error.details)}` : '';
            alert(`Failed to generate recipe: ${error.message}${details}`);
        } finally {
            hideLoading();
        }
    });

    // --- Helper Functions ---

    function updateIngredientsEditor() {
        ingredientsListEditor.innerHTML = '';
        currentIngredients.forEach((ingredient, index) => {
            const tag = document.createElement('div');
            tag.className = 'ingredient-tag';
            tag.textContent = ingredient;
            const removeBtn = document.createElement('span');
            removeBtn.textContent = '×';
            removeBtn.onclick = () => {
                currentIngredients.splice(index, 1);
                updateIngredientsEditor();
            };
            tag.appendChild(removeBtn);
            ingredientsListEditor.appendChild(tag);
        });
    }

    addIngredientBtn.addEventListener('click', () => {
        const newIngredient = addIngredientInput.value.trim();
        if (newIngredient && !currentIngredients.includes(newIngredient)) {
            currentIngredients.push(newIngredient);
            updateIngredientsEditor();
            addIngredientInput.value = '';
        }
    });

    function displayRecipe(recipe) {
        recipeContent.innerHTML = `
            <h2>${recipe.title}</h2>
            <p class="description">${recipe.desc}</p>
            <div class="ingredients-section">
                <div>
                    <h3>Used Ingredients</h3>
                    <ul>${recipe.used.map(ing => `<li>${ing}</li>`).join('')}</ul>
                </div>
                <div>
                    <h3>Other Needed Ingredients</h3>
                    <ul>${recipe.needs.map(ing => `<li>${ing}</li>`).join('')}</ul>
                </div>
            </div>
            <h3>Instructions</h3>
            <ol>${recipe.instr.map(step => `<li>${step}</li>`).join('')}</ol>
        `;
    }

    function fileToBase64(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = () => resolve(reader.result.split(',')[1]);
            reader.onerror = error => reject(error);
        });
    }
});
