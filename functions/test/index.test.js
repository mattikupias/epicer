const chai = require('chai');
const sinon = require('sinon');
const admin = require('firebase-admin');
const test = require('firebase-functions-test')();
const expect = chai.expect;

// Prevent admin.initializeApp from being called in the actual functions file
const adminInitStub = sinon.stub(admin, 'initializeApp');

// Now, require the functions to be tested
const myFunctions = require('../index.js');

describe('Cloud Functions', () => {
  after(() => {
    // Restore the original function after all tests are done
    adminInitStub.restore();
    test.cleanup();
  });

  describe('getIngredientsFromImage', () => {
    it('should return ingredients when a valid image is provided', async () => {
        // We are not testing the Vertex AI model itself, just that our function handles it.
        // So we can return a mocked response.
        const fakeVisionResult = { response: { candidates: [{ content: { parts: [{ text: 'Tomaatti, Juusto, Leipä' }] } }] } };
        
        // To access the model, we need to get it from the required module
        const visionModelStub = sinon.stub(myFunctions.visionModel, 'generateContent').resolves(fakeVisionResult);

        const wrapped = test.wrap(myFunctions.getIngredientsFromImage);
        const data = { image: 'fake_base64_image_data' };

        const result = await wrapped(data);

        expect(result).to.deep.equal({ ingredients: 'Tomaatti, Juusto, Leipä' });
        visionModelStub.restore();
    });

    it('should throw an error if no image is provided', async () => {
      const wrapped = test.wrap(myFunctions.getIngredientsFromImage);
      try {
        await wrapped({});
        expect.fail('Expected function to throw an HttpsError');
      } catch (error) {
        expect(error.code).to.equal('invalid-argument');
        expect(error.message).to.equal('The function must be called with an "image" argument.');
      }
    });
  });

  describe('generateRecipe', () => {
    it('should return a recipe when valid ingredients are provided', async () => {
        const fakeRecipeJSON = {
            title: "Herkullinen Tomaatti-Juustoleipä",
            description: "Helppo ja nopea välipala.",
            usedIngredients: ["Tomaatti", "Juusto"],
            otherIngredients: ["Leipä"],
            instructions: ["Laita juusto ja tomaatti leivän päälle.", "Paista uunissa 200 asteessa 10 minuuttia."]
        };
        const fakeTextResult = { response: { candidates: [{ content: { parts: [{ text: JSON.stringify(fakeRecipeJSON) }] } }] } };
        const textModelStub = sinon.stub(myFunctions.textModel, 'generateContent').resolves(fakeTextResult);

        const wrapped = test.wrap(myFunctions.generateRecipe);
        const data = { ingredients: ['Tomaatti', 'Juusto'] };

        const result = await wrapped(data);

        expect(result).to.deep.equal(fakeRecipeJSON);
        textModelStub.restore();
    });

    it('should throw an error if ingredients are missing or invalid', async () => {
      const wrapped = test.wrap(myFunctions.generateRecipe);

      try {
        await wrapped({ ingredients: [] }); // Empty array
        expect.fail('Expected function to throw for empty ingredients array');
      } catch (error) {
        expect(error.code).to.equal('invalid-argument');
      }
    });
  });
});
