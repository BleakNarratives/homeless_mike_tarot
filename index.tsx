/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { GoogleGenAI, GenerateContentResponse } from '@google/genai';

// NOTE: The original base64 string was corrupted. It has been replaced with a valid placeholder.
// It should be a base64 representation of the user's face, without the data URI prefix.
const SARAH_IMAGE_BASE64 =
  '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFAEBAAAAAAAAAAAAAAAAAAAAAP/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/ALQAB//Z';

const MAJOR_ARCANA = [
  'The Fool', 'The Magician', 'The High Priestess', 'The Empress', 'The Emperor',
  'The Hierophant', 'The Lovers', 'The Chariot', 'Strength', 'The Hermit',
  'Wheel of Fortune', 'Justice', 'The Hanged Man', 'Death', 'Temperance',
  'The Devil', 'The Tower', 'The Star', 'The Moon', 'The Sun', 'Judgement', 'The World'
];

const MINOR_ARCANA = {
    'Wands': ['Ace', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Page', 'Knight', 'Queen', 'King'],
    'Cups': ['Ace', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Page', 'Knight', 'Queen', 'King'],
    'Swords': ['Ace', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Page', 'Knight', 'Queen', 'King'],
    'Pentacles': ['Ace', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Page', 'Knight', 'Queen', 'King']
};

type CardType = 'major' | 'minor';

type TarotCard = {
  name: string;
  imageUrl: string;
  type: CardType;
};

let generatedDeck: TarotCard[] = [];
let isGenerating = false;
let isAmbiancePlaying = false;

// --- DOM Elements ---
const generateButton = document.getElementById('generateButton') as HTMLButtonElement;
const readingButton = document.getElementById('readingButton') as HTMLButtonElement;
const tarotDeckContainer = document.getElementById('tarotDeckContainer') as HTMLDivElement;
const errorMessageDiv = document.getElementById('errorMessage') as HTMLDivElement;
const readingResultContainer = document.getElementById('readingResultContainer') as HTMLDivElement;
const userQueryInput = document.getElementById('userQuery') as HTMLTextAreaElement;
const spreadSelect = document.getElementById('spreadSelect') as HTMLSelectElement;
const loadingContainer = document.getElementById('loadingContainer') as HTMLDivElement;
const legalModal = document.getElementById('legalModal') as HTMLDialogElement;
const closeModalBtn = document.getElementById('closeModalBtn') as HTMLButtonElement;
const disclaimerLink = document.getElementById('disclaimerLink') as HTMLAnchorElement;
const tosLink = document.getElementById('tosLink') as HTMLAnchorElement;
const privacyLink = document.getElementById('privacyLink') as HTMLAnchorElement;
const voiceStatus = document.getElementById('voiceStatus') as HTMLSpanElement;
const ambianceToggle = document.getElementById('ambianceToggle') as HTMLButtonElement;
const ambianceOnIcon = document.getElementById('ambiance-on-icon') as HTMLElement;
const ambianceOffIcon = document.getElementById('ambiance-off-icon') as HTMLElement;
const barrelFireAudio = document.getElementById('barrelFireAudio') as HTMLAudioElement;
const dogsBarkingAudio = document.getElementById('dogsBarkingAudio') as HTMLAudioElement;


// --- Gemini API Initialization ---
let ai: GoogleGenAI;
try {
  ai = new GoogleGenAI({ apiKey: process.env.API_KEY! });
} catch (error) {
  console.error(error);
  displayError('Failed to initialize AI. Please check API Key.');
}

/**
 * Displays an error message in the UI.
 * @param message The error message to display.
 */
function displayError(message: string) {
  errorMessageDiv.textContent = message;
  console.error(message);
}

/**
 * Sets the loading state of the UI.
 * @param isLoading Whether the application is in a loading state.
 */
function setLoading(isLoading: boolean) {
  isGenerating = isLoading;
  generateButton.disabled = isLoading;
  readingButton.disabled = isLoading || generatedDeck.length === 0;

  if (isLoading) {
    loadingContainer.style.display = 'flex';
    tarotDeckContainer.innerHTML = '';
    errorMessageDiv.textContent = '';
    readingResultContainer.innerHTML = '';
  } else {
    loadingContainer.style.display = 'none';
  }
}

/**
 * Creates a tarot card DOM element.
 * @param card The tarot card data.
 * @returns The created card element.
 */
function createCardElement(card: TarotCard): HTMLDivElement {
  const flashcard = document.createElement('div');
  flashcard.className = 'flashcard';

  const flashcardInner = document.createElement('div');
  flashcardInner.className = 'flashcard-inner';

  const flashcardFront = document.createElement('div');
  flashcardFront.className = 'flashcard-front';
  const img = document.createElement('img');
  img.src = card.imageUrl;
  img.alt = card.name;
  img.loading = 'lazy';
  const cardName = document.createElement('div');
  cardName.className = 'card-name';
  cardName.textContent = card.name;
  flashcardFront.append(img, cardName);

  const flashcardBack = document.createElement('div');
  flashcardBack.className = 'flashcard-back';
  if (card.type === 'minor') {
    flashcardBack.classList.add('minor-arcana-back');
  }

  flashcardInner.append(flashcardFront, flashcardBack);
  flashcard.appendChild(flashcardInner);

  return flashcard;
}

/**
 * Generates the full 78-card tarot deck using the Gemini API.
 */
async function generateDeck() {
  if (isGenerating || !ai) return;
  setLoading(true);
  generatedDeck = [];

  const allCardsToGenerate = [
      ...MAJOR_ARCANA.map(name => ({ name, type: 'major' as CardType })),
      ...Object.entries(MINOR_ARCANA).flatMap(([suit, ranks]) =>
          ranks.map(rank => ({ name: `${rank} of ${suit}`, type: 'minor' as CardType }))
      )
  ];

  const generationPromises = allCardsToGenerate.map(async ({ name, type }) => {
    try {
      let imageUrl: string;
      if (type === 'major') {
        const prompt = `A tarot card depicting "${name}". A face, created from the provided image, should be subtly integrated into the main figure of the card. The overall theme is one of implied despair, with a dark, gritty, and atmospheric art style.`;
        const response = await ai.models.generateContent({
          model: 'gemini-2.5-flash-image-preview',
          contents: {
            parts: [
              { inlineData: { data: SARAH_IMAGE_BASE64, mimeType: 'image/jpeg' } },
              { text: prompt },
            ],
          },
        });
        const base64ImageBytes: string = response.candidates![0].content.parts[0].inlineData!.data;
        imageUrl = `data:image/jpeg;base64,${base64ImageBytes}`;
      } else { // Minor Arcana
        // The Ten of Swords has a special prompt
        const prompt = name === 'Ten of Swords'
            ? `A tarot card depicting the "Ten of Swords". Bleak, graffiti-style occult aesthetic. The swords should have intricate, glowing gold inlays. Despair and finality are the themes.`
            : `A tarot card depicting "${name}". Bleak, graffiti-style occult aesthetic. Dark, atmospheric, and tinged with a sense of dread or struggle.`;
        
        const response = await ai.models.generateImages({
            model: 'imagen-4.0-generate-001',
            prompt: prompt,
            config: {
              numberOfImages: 1,
              outputMimeType: 'image/jpeg',
              aspectRatio: '3:4',
            }
        });
        const base64ImageBytes: string = response.generatedImages[0].image.imageBytes;
        imageUrl = `data:image/jpeg;base64,${base64ImageBytes}`;
      }
      return { name, imageUrl, type };
    } catch (error) {
      console.error(`Failed to generate image for ${name}:`, error);
      return null;
    }
  });

  const results = await Promise.all(generationPromises);
  generatedDeck = results.filter((card): card is TarotCard => card !== null);

  setLoading(false);

  if (generatedDeck.length < allCardsToGenerate.length) {
    displayError('Some cards failed to generate. The deck is incomplete.');
  }

  if (generatedDeck.length > 0) {
    tarotDeckContainer.innerHTML = '';
    generatedDeck.forEach(card => {
      const cardElement = createCardElement(card);
      tarotDeckContainer.appendChild(cardElement);
    });
    readingButton.style.display = 'inline-block';
    readingButton.disabled = false;
  }
}

/**
 * Performs a tarot reading using the Gemini API.
 */
async function getReading() {
  if (isGenerating || generatedDeck.length === 0 || !ai) return;

  const selectedSpread = spreadSelect.value;
  const spreadDetails = getSpreadDetails(selectedSpread);
  
  if (!spreadDetails) {
    displayError('Invalid spread selected.');
    return;
  }
  
  // Draw cards
  const shuffledDeck = [...generatedDeck].sort(() => 0.5 - Math.random());
  const drawnCards = shuffledDeck.slice(0, spreadDetails.cardCount);

  readingButton.disabled = true;
  readingResultContainer.innerHTML = '<div class="loading-container"><div class="sigil-loader"></div><p class="loading-text">Consulting the abyss for your reading...</p></div>';
  errorMessageDiv.textContent = '';
  
  displayReadingSpread(drawnCards, spreadDetails.layout);

  const userQuery = userQueryInput.value.trim();
  
  const cardDetails = drawnCards.map((card, index) => 
    `Card ${index + 1} (${spreadDetails.positions[index]}): ${card.name}`
  ).join('\n');
  
  const prompt = `You are a tarot reader named Homeless Mike. Your interpretations are bleak, cynical, and tinged with despair, but ultimately insightful.
  A user has asked the following question: "${userQuery || 'No specific question was asked, focus on a general life reading.'}"
  The tarot spread is "${spreadDetails.name}".
  The cards drawn for each position are:
  ${cardDetails}
  
  Provide a grim but coherent interpretation of the cards in relation to the user's query and the spread positions. Synthesize the meanings together into a narrative. Address the user directly.`;

  try {
    const response: GenerateContentResponse = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt
    });

    const interpretationText = response.text;
    const interpretationElement = document.createElement('div');
    interpretationElement.className = 'reading-interpretation';
    interpretationElement.textContent = interpretationText;

    const existingSpread = readingResultContainer.querySelector('.reading-spread');
    readingResultContainer.innerHTML = '';
    if(existingSpread) readingResultContainer.appendChild(existingSpread);
    readingResultContainer.appendChild(interpretationElement);

  } catch (error) {
    console.error('Failed to get reading:', error);
    displayError('The spirits are silent. Failed to get an interpretation.');
    readingResultContainer.innerHTML = ''; // Clear loading
  } finally {
    readingButton.disabled = false;
  }
}

/**
 * Gets details for a selected tarot spread.
 */
function getSpreadDetails(spreadValue: string): { name: string, cardCount: number, positions: string[], layout: string } | null {
    const spreads: { [key: string]: { name: string, cardCount: number, positions: string[], layout: string } } = {
        'single': { name: 'Single Card Draw', cardCount: 1, positions: ['The core of the matter.'], layout: 'default'},
        'three-card': { name: 'Past, Present, Future', cardCount: 3, positions: ['Past', 'Present', 'Future'], layout: 'default' },
        'situation': { name: 'Situation, Obstacle, Advice', cardCount: 3, positions: ['Situation', 'Obstacle', 'Advice'], layout: 'default' },
        'mbs': { name: 'Mind, Body, Spirit', cardCount: 3, positions: ['Mind', 'Body', 'Spirit'], layout: 'default' },
        'relationship': { name: 'Relationship Spread', cardCount: 5, positions: ['You', 'Your Partner', 'Foundation', 'Challenge', 'Potential'], layout: 'default' },
        'chains-of-saturn': { name: 'Chains of Saturn', cardCount: 6, positions: ['Core Limitation', 'Internal Aspect', 'External Aspect', 'What must be accepted', 'Path to liberation', 'The lesson learned'], layout: 'default' },
        'horseshoe': { name: 'The Horseshoe', cardCount: 7, positions: ['The Past', 'The Present', 'The Future', 'The Querent', 'External Influences', 'Hopes and Fears', 'The Outcome'], layout: 'default' },
        'celtic-cross': { name: 'Celtic Cross', cardCount: 10, positions: ['The Present', 'The Challenge', 'The Past', 'The Future', 'Conscious Mind', 'Unconscious Mind', 'Your Influence', 'External Influences', 'Hopes and Fears', 'The Outcome'], layout: 'celtic-cross-spread' }
    };
    return spreads[spreadValue] || null;
}

/**
 * Displays the drawn cards for a reading.
 */
function displayReadingSpread(cards: TarotCard[], layoutClass: string) {
    const spreadContainer = document.createElement('div');
    spreadContainer.className = `reading-spread ${layoutClass}`;

    cards.forEach((card, index) => {
        const cardContainer = document.createElement('div');
        cardContainer.className = 'reading-card';
        cardContainer.style.animationDelay = `${index * 100}ms`;
        
        const img = document.createElement('img');
        img.src = card.imageUrl;
        img.alt = card.name;
        img.loading = 'lazy';

        const name = document.createElement('div');
        name.className = 'card-name';
        name.textContent = `${index + 1}. ${card.name}`;

        cardContainer.append(img, name);
        spreadContainer.appendChild(cardContainer);
    });

    readingResultContainer.innerHTML = ''; // Clear previous
    readingResultContainer.appendChild(spreadContainer);
}


// --- Event Listeners ---
generateButton.addEventListener('click', generateDeck);
readingButton.addEventListener('click', getReading);

// --- Modal Listeners ---
const openModal = (e: Event) => {
    e.preventDefault();
    legalModal.showModal();
};
disclaimerLink.addEventListener('click', openModal);
tosLink.addEventListener('click', openModal);
privacyLink.addEventListener('click', openModal);
closeModalBtn.addEventListener('click', () => legalModal.close());

// --- Ambiance Control ---
function handleAmbianceToggle() {
    isAmbiancePlaying = !isAmbiancePlaying;
    if (isAmbiancePlaying) {
        barrelFireAudio.play().catch(e => console.error("Barrel fire audio failed:", e));
        dogsBarkingAudio.play().catch(e => console.error("Dogs barking audio failed:", e));
        ambianceOnIcon.style.display = 'block';
        ambianceOffIcon.style.display = 'none';
    } else {
        barrelFireAudio.pause();
        dogsBarkingAudio.pause();
        ambianceOnIcon.style.display = 'none';
        ambianceOffIcon.style.display = 'block';
    }
}
ambianceToggle.addEventListener('click', handleAmbianceToggle);


// --- Initial State ---
readingButton.style.display = 'none';

// --- Logo Initialization ---
const APP_LOGO_BASE64 = 'data:image/svg+xml;base64,' + btoa(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <defs>
    <filter id="grunge-filter" x="-20%" y="-20%" width="140%" height="140%">
      <feTurbulence type="fractalNoise" baseFrequency="0.04" numOctaves="3" result="noise" />
      <feDisplacementMap in="SourceGraphic" in2="noise" scale="5" xChannelSelector="R" yChannelSelector="B" result="displaced" />
      <feTurbulence type="fractalNoise" baseFrequency="1.5" numOctaves="5" result="scratchNoise" />
      <feDisplacementMap in="SourceGraphic" in2="scratchNoise" scale="1.2" xChannelSelector="R" yChannelSelector="G" result="scratched" />
      <feBlend in="displaced" in2="scratched" mode="multiply" />
    </filter>
  </defs>
  <g style="filter:url(#grunge-filter);" stroke="var(--dark-text-primary)" stroke-width="5" stroke-linecap="round" fill="none">
    <!-- Worn Circle -->
    <path d="M 90,50 A 40,40 0 1 1 10,50 A 40,40 0 1 1 90,50 Z" stroke-width="6"/>
    
    <!-- Crossroads Sigil -->
    <path d="M 50,20 V 80" />
    <path d="M 50,50 L 25,75" />
    <path d="M 50,50 L 75,75" />
  </g>
</svg>
`);
(document.getElementById('appLogo') as HTMLImageElement).src = APP_LOGO_BASE64;


// --- Voice Command Logic ---
function setupSpeechRecognition() {
  const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
  if (!SpeechRecognition) {
    if (voiceStatus) voiceStatus.textContent = 'Voice recognition not supported.';
    const micIcon = document.querySelector('.mic-icon');
    if (micIcon) (micIcon as HTMLElement).style.display = 'none';
    return;
  }

  const recognition = new SpeechRecognition();
  recognition.continuous = true;
  recognition.interimResults = false;
  recognition.lang = 'en-US';

  const resetStatus = () => setTimeout(() => {
      if (voiceStatus) voiceStatus.textContent = 'Ready for command.';
  }, 2500);

  recognition.onstart = () => {
    if (voiceStatus) voiceStatus.textContent = 'Ready for command.';
  };

  recognition.onresult = (event: any) => {
    const transcript = event.results[event.results.length - 1][0].transcript.trim().toLowerCase();
    console.log('Heard:', transcript);

    if (transcript.includes('get reading') || transcript.includes('get my reading')) {
      if (!readingButton.disabled) {
        if (voiceStatus) voiceStatus.textContent = 'Acknowledged. Getting reading...';
        readingButton.click();
      }
    } else if (transcript.includes('toggle ambiance')) {
      handleAmbianceToggle();
      if (voiceStatus) voiceStatus.textContent = `Ambiance ${isAmbiancePlaying ? 'on' : 'off'}.`;
      resetStatus();
    }
  };

  recognition.onerror = (event: any) => {
    console.error('Speech recognition error:', event.error);
    if (voiceStatus) voiceStatus.textContent = 'Voice recognition error.';
  };

  recognition.onend = () => {
    // Automatically restart recognition if it stops
    if (!isGenerating) {
        recognition.start();
    }
  };

  try {
    recognition.start();
  } catch(e) {
    console.error("Could not start voice recognition:", e);
    if (voiceStatus) voiceStatus.textContent = 'Voice recognition failed to start.';
  }
}

setupSpeechRecognition();
