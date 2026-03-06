// -------------------------
// script.js
// -------------------------
// Pyodide + Run-button code placed at the TOP (as requested)
// -------------------------

// ---- Pyodide setup ----
let pyodide = null;
let pyodideReady = false;
let currentExecution = null;
let isRunning = false;

const EXECUTION_TIMEOUT_MS = 20000;
let executionTimer = null;

let pyWorker = null;
let workerReady = false;
let workerInitResolve = null;
let workerInitReject = null;
let workerInitPromise = null;
let runRequestId = 0;
let pendingRuns = new Map();
let interruptBuffer = null;
let stopMode = "terminate";

function createWorkerInitPromise() {
  workerInitPromise = new Promise((resolve, reject) => {
    workerInitResolve = resolve;
    workerInitReject = reject;
  });
}

function rejectAllPendingRuns(message) {
  for (const [, handlers] of pendingRuns.entries()) {
    handlers.reject(new Error(message));
  }
  pendingRuns.clear();
}

function setupPythonWorker() {
  workerReady = false;
  pyodideReady = false;
  createWorkerInitPromise();

  pyWorker = new Worker('py-worker.js');

  pyWorker.onmessage = (event) => {
    const data = event.data || {};

    if (data.type === 'ready') {
      workerReady = true;
      pyodideReady = true;
      if (workerInitResolve) workerInitResolve();
      console.log('Pyodide worker loaded successfully');
      return;
    }

    if (data.type === 'result') {
      const handlers = pendingRuns.get(data.id);
      if (!handlers) return;
      pendingRuns.delete(data.id);
      handlers.resolve(String(data.output || ''));
      return;
    }

    if (data.type === 'error') {
      const handlers = pendingRuns.get(data.id);
      if (!handlers) return;
      pendingRuns.delete(data.id);
      handlers.reject(new Error(data.error || 'Execution failed.'));
      return;
    }

    if (data.type === 'init_error') {
      workerReady = false;
      pyodideReady = false;
      if (workerInitReject) workerInitReject(new Error(data.error || 'Failed to initialize Pyodide worker.'));
      console.error('Failed to initialize Pyodide worker:', data.error);
    }
  };

  pyWorker.onerror = (error) => {
    rejectAllPendingRuns('Execution stopped.');
    workerReady = false;
    pyodideReady = false;
    if (workerInitReject) workerInitReject(error);
    console.error('Pyodide worker error:', error);
  };

  pyWorker.postMessage({
    type: 'init',
    interruptBuffer: interruptBuffer
  });
}

async function loadPyodideAndPackages() {
  try {
    if (typeof SharedArrayBuffer !== 'undefined') {
      interruptBuffer = new Int32Array(new SharedArrayBuffer(4));
      stopMode = 'interrupt';
    } else {
      interruptBuffer = null;
      stopMode = 'terminate';
    }

    setupPythonWorker();
    await workerInitPromise;
  } catch (error) {
    console.error('Failed to load Pyodide:', error);
  }
}
loadPyodideAndPackages();

function resetPythonWorker(message = 'Execution stopped.') {
  if (pyWorker) {
    pyWorker.terminate();
    pyWorker = null;
  }

  rejectAllPendingRuns(message);
  workerReady = false;
  pyodideReady = false;
  setupPythonWorker();
}

// Utility to run Python capturing stdout & exceptions
async function runPythonCaptureOutput(code) {
  if (!workerInitPromise) {
    throw new Error('Pyodide worker is not initialized yet');
  }

  await workerInitPromise;

  if (!pyodideReady || !pyWorker) {
    throw new Error('Pyodide not loaded yet');
  }

  const id = ++runRequestId;

  return new Promise((resolve, reject) => {
    pendingRuns.set(id, { resolve, reject });
    pyWorker.postMessage({
      type: 'run',
      id,
      code
    });
  });
}

function requestPythonStop(reasonMessage = 'Execution manually stopped.') {
  if (stopMode === 'interrupt' && pyWorker && interruptBuffer) {
    pyWorker.postMessage({ type: 'interrupt' });
  } else {
    resetPythonWorker(reasonMessage);
  }
}

function ensureCodeMirrorFocus(editor) {
  if (!editor || !editor.getWrapperElement) return;
  const wrapper = editor.getWrapperElement();

  // Force CodeMirror to truly focus on first click/tap.
  wrapper.addEventListener("mousedown", () => {
    setTimeout(() => {
      try {
        editor.focus();
        editor.refresh();
      } catch (e) {
        // non-fatal
      }
    }, 0);
  });

  // Mobile/touch support
  wrapper.addEventListener("touchstart", () => {
    setTimeout(() => {
      try {
        editor.focus();
        editor.refresh();
      } catch (e) {
        // non-fatal
      }
    }, 0);
  }, { passive: true });
}



// -------------------------
// The rest of your original application code
// (keystroke logging, rendering, CodeMirror integration, downloads, translations, etc.)
// Unmodified function names so index.html continues to call setLanguage(...) etc.
// -------------------------

// Define session questions in English only
// Key: "Added Code:"-commented out code/added my own "Next Steps: Comment explaining something I should do in future"
let session1Questions = {
  en: [
    `Write a Python program that defines five variables: an integer, a float, a string, a boolean, and a list. Print each variable and use type() to display its data type.`,
    `Below is an example showing how to calculate the area of a rectangle using two variables (length and width) and the * operator:

length = 10
width = 5
area = length * width
print("The area of the rectangle is:", area)

Using your understanding of how this code works and how the * operator performs multiplication, write your own line of Python code that calculates the area of a rectangle, but with different variable names.`,
    `Write a Python program that uses a for loop to compute the sum of all odd numbers between 1 and 100, then print the total. Use a conditional inside the loop to identify odd numbers.`,
    `Below is a Python program:

numbers = [2, 5, 8, 11, 14]
total = 0
for n in numbers:
    total += n
print("Sum:", total)

Rewrite the program into two functions: one that calculates the total and another that prints it. Include comments to distinguish which lines perform computation and which handle output.`,
    `Write two Python programs that calculate the factorial of a number: one using recursion and one using a loop. After running both, evaluate which version is faster by counting iterations and explain the result in a short printed summary.`,
    `Construct a Python program that simulates a basic ATM system using predefined transactions (no user input). The program should:
1. Process deposits and withdrawals from a preset list of transactions.
2. Maintain and update the account balance.
3. Prevent withdrawals that exceed the available balance.
4. Do not use any input functions.
5. Use functions and loops to organize your solution.`
  ]
};

let session2Questions = {
  en: [
    `Name three traditional Korean holidays and briefly explain their significance (Use 150-200 words)`,
    `Explain the reasons for the popularity of Korean cuisine internationally (Use 150-200 words)`,
    `What elements would you choose to change in the current university curriculum to better prepare students for the future job market? (Use 150-200 words)`,
    `Describe the impact of Confucianism on modern Korean society (Use 150-200 words)`,
    `Evaluate the impact of social media on mental health among teenagers (Use 150-200 words)`,
    `Create an innovative project to promote eco-friendly practices in Korean households (Use 150-200 words)`
  ]
};

let session3Questions = {
  en: [
    `Describe your childhood neighborhood (Mention any favorite place or how it has changed since?) (Use 150-200 words)`,
    `Explain the cultural significance of the Korean Wave in promoting Korean culture (Use 150-200 words)`,
    `How would you implement a nationwide initiative in South Korea to increase digital literacy among the elderly population? (Use 150-200 words)`,
    `Examine the social and economic factors that have contributed to relatively low happiness index in South Korea and propose solutions. (Use 150-200 words)`,
    `Evaluate the effectiveness of South Korea's response to the COVID-19 pandemic. What were the key strategies, and how successful were they? (Use 150-200 words)`,
    `Design a comprehensive policy to address income inequality in South Korea (Use 150-200 words)`
  ]
};

// Session instructions for each session in English only
//Next Steps: Determine anticipated duration 
let sessionInstructions = {
  session1: {
    en: `Complete each question yourself without using ChatGPT or any other external help.
Anticipated duration: 30-40 minutes.`
  },
  session2: {
    en: `Copy the question and directly paste it into ChatGPT.
Copy the generated response from ChatGPT and paste it into the corresponding input field indicated.
Paraphrase the generated response by going through line by line.
Keep in mind, paraphrasing is rendering the same code in different words without losing the function of the code itself.
Repeat the above steps for each question in this session.
Anticipated duration: 30-40 minutes.`
  },
  session3: {
    en: `Copy the question (including the number of words required) and directly paste it into ChatGPT.
Copy the generated response from ChatGPT and paste it into the corresponding input field indicated.
Retype the response generated by ChatGPT word for word.`
  }
};

// Global variables to store inputs, keystrokes, and user information
let inputs = [];
let keystrokes = [];
let currentSession = window.FORCED_SESSION || 1;
let userInfo = {};
let totalQuestions = 0; // Track the total number of questions
let language = 'en';

// Function to log keystrokes, excluding first input in sessions 2 and 3
function logKeystroke(event) {
  let timestamp = Date.now();

  // Try to find the CodeMirror instance's textarea or underlying DOM node
  // event.target will be a DOM node for native events; for CodeMirror keyboard events the 'event' passed by CodeMirror
  // is usually a DOM KeyboardEvent; using event.target should work in most cases.
  let inputIndex = inputs.findIndex(input => input.element === event.target || input.element.getInputElement && input.element.getInputElement && input.element.getInputElement?.() === event.target);

  // If not found using direct target equality, we can attempt a fall-back: match by comparing CodeMirror.display.wrapper.contains(target)
  if (inputIndex === -1) {
    for (let i = 0; i < inputs.length; i++) {
      const el = inputs[i].element;
      if (el && el.getWrapperElement && typeof el.getWrapperElement === 'function') {
        const wrapper = el.getWrapperElement();
        if (wrapper && wrapper.contains && wrapper.contains(event.target)) {
          inputIndex = i;
          break;
        }
      }
    }
  }

  // Identify the current session questions
  let questions;
  if (currentSession === 1) {
    questions = session1Questions[language];
  } else if (currentSession === 2) {
    questions = session2Questions[language];
  } else if (currentSession === 3) {
    questions = session3Questions[language];
  }

  let questionIndex = Math.floor((inputIndex - totalQuestions) / (currentSession === 1 ? 2 : 2));
  let question = questions && questions[questionIndex] ? questions[questionIndex] : null;

  // Skip logging for the first input field in sessions 2 and 3
  if (currentSession !== 1) {
    let isFirstInput = (inputIndex - totalQuestions) % 2 === 0;
    if (isFirstInput) {
      return; // Do not log keystrokes for the first input field
    }
  }

let inputType = inputs[inputIndex]?.type || "unknown";

keystrokes.push({
  s_n: currentSession,
  q: question,
  r_t: inputType, // code vs explanation
  q_n: (questionIndex + 1),
  key: event.key,
  code: event.code,
  event: event.type,
  timestamp: timestamp,
  repeat: event.repeat
});
}

// Function to start the session after user information is captured
function startSession() {
  hideAlert(); // Hide alert message when starting the session
  let container = document.getElementById('container');
  container.style.display = 'block';
  document.getElementById('introduction').style.display = 'none';
  
  // Hide user info form
  document.getElementById('user-info-form').style.display = 'none';

  let heading = document.querySelector('h1');
  let subHeading = document.createElement('h2');
  subHeading.className = 'center-text'; // Center the subheading
  if (currentSession === 1) {
    subHeading.textContent = 'Bonafide Writing';
    renderQuestions(container, session1Questions[language]);
  } else if (currentSession === 2) {
    subHeading.textContent = 'Paraphrasing ChatGPT';
    renderQuestions(container, session2Questions[language], true); // Pass true to indicate two input fields
  } else if (currentSession === 3) {
    subHeading.textContent = 'Retyping ChatGPT';
    renderQuestions(container, session3Questions[language], true); // Pass true to indicate two input fields
  }
  heading.after(subHeading);

  let submitButton = document.createElement('button');
submitButton.className = 'btn center-text';
submitButton.textContent = 'Submit';
container.appendChild(submitButton);

submitButton.addEventListener('click', () => {
  let questions;

  if (currentSession === 1) {
    questions = session1Questions[language];
  } else if (currentSession === 2) {
    questions = session2Questions[language];
  } else {
    questions = session3Questions[language];
  }

  let twoInputs = currentSession !== 1;

  if (checkAllAnswered(questions, twoInputs)) {
    submitForm();
  } else {
    showAlert('Please answer all questions before submitting.');
  }
});
}
function attachRunStopControls(editor, outputElement, container) {
  const runBtn = document.createElement("button");
  runBtn.className = "runBtn";
  runBtn.textContent = "Run";

  const stopBtn = document.createElement("button");
  stopBtn.className = "stopBtn";
  stopBtn.textContent = "Stop";
  stopBtn.disabled = true;

  container.appendChild(runBtn);
  container.appendChild(stopBtn);

  runBtn.addEventListener("click", async () => {
    if (isRunning) return;

    if (!pyodideReady) {
      outputElement.textContent = "Pyodide is still loading...";
      return;
    }

    const code = editor.getValue().trim();

    isRunning = true;
    runBtn.disabled = true;
    stopBtn.disabled = false;
    outputElement.textContent = "Running...";

    try {
      currentExecution = runPythonCaptureOutput(code);

      executionTimer = setTimeout(() => {
        requestPythonStop("Execution stopped: exceeded 20 second limit.");
      }, EXECUTION_TIMEOUT_MS);

      const result = await currentExecution;
      outputElement.textContent = result || "";
    } catch (err) {
      outputElement.textContent = err.message || "Execution stopped.";
    } finally {
      clearTimeout(executionTimer);
      executionTimer = null;
      isRunning = false;
      runBtn.disabled = false;
      stopBtn.disabled = true;
      currentExecution = null;
    }
  });

  stopBtn.addEventListener("click", () => {
    if (!isRunning) return;
    outputElement.textContent = "Stopping execution...";
    requestPythonStop("Execution manually stopped.");
  });
}
// Added Code: Fully replaced this function to add the code boxes to replace the text area boxes. Overall this is a function to render questions dynamically
function renderQuestions(container, questions, twoInputs = false) {
  container.innerHTML = "";

  // ===== Instruction Rendering =====
  let instructions = document.createElement('div');
  instructions.className = 'instruction-box';

  let instructionText = '';
  if (currentSession === 1) {
    instructionText = sessionInstructions.session1[language];
  } else if (currentSession === 2) {
    instructionText = sessionInstructions.session2[language];
  } else if (currentSession === 3) {
    instructionText = sessionInstructions.session3[language];
  }

  // Create a paragraph for the instruction heading
  let instructionHeading = document.createElement('p');
  instructionHeading.textContent = 'Steps to follow:';
  instructions.appendChild(instructionHeading);

  // Create an ordered list element for the steps
  let instructionList = document.createElement('ol');
  instructionText.split('\n').forEach(line => {
    let listItem = document.createElement('li');
    listItem.textContent = line.trim();
    instructionList.appendChild(listItem);
  });

  instructions.appendChild(instructionList);
  container.appendChild(instructions);
  // ===== End of Instruction Rendering =====


  // ===== Question Rendering =====
  questions.forEach((q, i) => {
    const questionDiv = document.createElement("div");
    questionDiv.className = "question-block";

    const questionLabel = document.createElement("h3");
    questionLabel.textContent = `${i + 1}. ${q}`;
    questionDiv.appendChild(questionLabel);

    const wordCountDiv = document.createElement("div");
    wordCountDiv.className = "word-count";
    questionDiv.appendChild(wordCountDiv);

    if (twoInputs) {
      // Left input column
      const leftDiv = document.createElement("div");
      leftDiv.className = "input-column left";
      const label1 = document.createElement("label");
      label1.textContent = "Version 1";
      leftDiv.appendChild(label1);

      // ---- Python CodeMirror Editor #1 ----
      let textarea1 = document.createElement("textarea");
      leftDiv.appendChild(textarea1);

      let editor1 = CodeMirror.fromTextArea(textarea1, {
        lineNumbers: true,
        mode: "python",
        theme: "default",
        indentUnit: 4,
        smartIndent: true,
      });
      
      ensureCodeMirrorFocus(editor1);
//Added Code: fully added both editor1on functions
        editor1.on('change', () => {
          updateWordCountEditor(editor1, wordCountDiv);
        });
        editor1.on('keydown', (instance, e) => {
          // e is a DOM event; pass it for keystroke logging
          if ((e.ctrlKey || e.metaKey) && ["c","v","x"].includes(e.key.toLowerCase())) {
  e.preventDefault();
  return false;
}
          try { logKeystroke(e); } catch (err) { /* non-fatal */ }
        });


      // --------- Run button & output for editor1 ---------
const output1 = document.createElement('pre');
output1.className = 'outputBox';
leftDiv.appendChild(output1);

attachRunStopControls(editor1, output1, leftDiv);
      inputs.push({ question: q, element: editor1, type: "code" });

      // Right input column
      const rightDiv = document.createElement("div");
      rightDiv.className = "input-column right";
      const label2 = document.createElement("label");
      label2.textContent = "Version 2";
      rightDiv.appendChild(label2);

      // ---- Python CodeMirror Editor #2 ----
      let textarea2 = document.createElement("textarea");
      rightDiv.appendChild(textarea2);

      let editor2 = CodeMirror.fromTextArea(textarea2, {
        lineNumbers: true,
        mode: "python",
        theme: "default",
        indentUnit: 4,
        smartIndent: true,
      });
      
      ensureCodeMirrorFocus(editor2);
//Added Code: Fully added editor 2 on
      editor2.on('change', () => {
        updateWordCountEditor(editor2, wordCountDiv);
      });
      editor2.on('keydown', (instance, e) => {
        if ((e.ctrlKey || e.metaKey) && ["c","v","x"].includes(e.key.toLowerCase())) {
  e.preventDefault();
  return false;
}  
        try { logKeystroke(e); } catch (err) { /* non-fatal */ }
          });

      // --------- Run button & output for editor2 ---------
      const output2 = document.createElement('pre');
output2.className = 'outputBox';
rightDiv.appendChild(output2);

attachRunStopControls(editor2, output2, rightDiv);
     inputs.push({ question: q, element: editor2, type: "code" }); 

      const dualDiv = document.createElement("div");
      dualDiv.className = "dual-input";
      dualDiv.appendChild(leftDiv);
      dualDiv.appendChild(rightDiv);
      questionDiv.appendChild(dualDiv);
} else {
  // ---- Single Python Editor ----
  let textarea = document.createElement("textarea");
  questionDiv.appendChild(textarea);

  let editor = CodeMirror.fromTextArea(textarea, {
    lineNumbers: true,
    mode: "python",
    theme: "default",
    indentUnit: 4,
    smartIndent: true,
  });

  
  ensureCodeMirrorFocus(editor);
  // Disable copy / paste / cut (single editor)
editor.on("beforeChange", (cm, change) => {
  if (change.origin === "paste") {
    change.cancel();
  }
});

const wrapper = editor.getWrapperElement();
wrapper.addEventListener("paste", e => e.preventDefault());
wrapper.addEventListener("copy",  e => e.preventDefault());
wrapper.addEventListener("cut",   e => e.preventDefault());

// Add live word count
  editor.on("change", () => {
    updateWordCountEditor(editor, wordCountDiv);
  });

  // Add keystroke logging for Session 1
  editor.on("keydown", (instance, e) => {
  if ((e.ctrlKey || e.metaKey) && ["c","v","x"].includes(e.key.toLowerCase())) {
    e.preventDefault();
    return false;
  }
  logKeystroke(e);
});

  // ---- Run button + output ----
  // ---- Output + Run/Stop controls ----
const outputSingle = document.createElement("pre");
outputSingle.className = "outputBox";
questionDiv.appendChild(outputSingle);

attachRunStopControls(editor, outputSingle, questionDiv);
  inputs.push({ question: q, element: editor, type: "code" });
} 
 // ===============================
// Explanation section (TEXT INPUT)
// ===============================
const explanationLabel = document.createElement("div");
explanationLabel.className = "explanation-label";
explanationLabel.textContent =
  `For Prompt ${i + 1}, explain line by line what the code does. ` +
  `Describe the purpose of each significant line or function.`;

questionDiv.appendChild(explanationLabel);

// Plain textarea (NOT CodeMirror)
const explanationBox = document.createElement("textarea");
explanationBox.className = "explanation-box";
explanationBox.rows = 6;

questionDiv.appendChild(explanationBox);
    explanationBox.addEventListener("paste", (e) => e.preventDefault());
explanationBox.addEventListener("copy", (e) => e.preventDefault());
explanationBox.addEventListener("cut", (e) => e.preventDefault());


// Keystroke logging
explanationBox.addEventListener("keydown", logKeystroke);

// Store separately from code inputs
inputs.push({
  question: q,
  element: explanationBox,
  type: "explanation"
});   container.appendChild(questionDiv);
  });

  return inputs;
}

// Function to update word count display
function updateWordCount(input, wordCountDiv) {
  //Added Code: changed value to getValue()
  let wordCount = input.getValue().trim().split(/\s+/).filter(word => word.length > 0).length;
  wordCountDiv.textContent = `Word count: ${wordCount}`;
}

//Added Code: Make live word count still update 
function updateWordCountEditor(editor, wordCountDiv) {
  let text = editor.getValue();
  let wordCount = text.trim().split(/\s+/).filter(word => word.length > 0).length;
  wordCountDiv.textContent = `Word count: ${wordCount}`;
}


// Function to check if all questions are answered
function checkAllAnswered(questions, twoInputs = false) {
  let startIndex = totalQuestions;
  let inputsPerQuestion = twoInputs ? 3 : 2; // code + explanation
  let endIndex = startIndex + questions.length * inputsPerQuestion;

  return inputs
    .slice(startIndex, endIndex)
    .every(input => {
      if (input.type === "explanation") {
        return input.element.value.trim() !== "";
      }
      return input.element.getValue().trim() !== "";
    });
}

// Function to create download link
function createDownloadLink(blob, filename) {
  let url = URL.createObjectURL(blob);
  let link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// Function to create a download button
function createDownloadButton(blob, filename, buttonText) {
  let url = URL.createObjectURL(blob);
  let button = document.createElement('button');
  button.className = 'btn center-text';
  button.textContent = buttonText;
  button.addEventListener('click', () => {
    let link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  });
  return button;
}

// Function to submit form data
function submitForm() {
  const session1ResponseStartIndex = 0;
  const session2ResponseStartIndex = session1Questions[language].length;
  const session3ResponseStartIndex = session1Questions[language].length + session2Questions[language].length * 2;
//Added Code: Changed every value to getValue()
  if (checkAllAnswered(session3Questions[language], true)) {
    let responses;

if (currentSession === 1) {
  responses = session1Questions[language].map((q, i) => ({
    s_n: 1,
    q: q,
    q_n: i + 1, 
    code: inputs[i * 2].element.getValue(),
    explanation: inputs[i * 2 + 1].element.value,
    codeWordCount: getWordCount(inputs[i * 2].element.getValue()),
    explanationWordCount: getWordCount(inputs[i * 2 + 1].element.value)
  }));
}

if (currentSession === 2) {
  responses = session2Questions[language].map((q, i) => ({
    session: 2,
    question: q,
    question_number: i, 
    code_version_1: inputs[i * 3].element.getValue(),
    code_version_2: inputs[i * 3 + 1].element.getValue(),
    explanation: inputs[i * 3 + 2].element.value
  }));
}

if (currentSession === 3) {
  responses = session3Questions[language].map((q, i) => ({
    session: 3,
    question: q,
    chatgptAnswer: inputs[i * 3].element.getValue(),
    retype: inputs[i * 3 + 1].element.getValue(),
    explanation: inputs[i * 3 + 2].element.value
  }));
}
    let responseData = {
      responses: responses
    };

    let keystrokeData = {
      keystrokes: keystrokes
    };

    // Capture user information
    let userInfoData = {
      gender: document.querySelector('input[name="gender"]:checked').value,
      age: document.getElementById('age').value,
      handedness: document.querySelector('input[name="handedness"]:checked').value,
      // Added code: commented out korean profieciency koreanProficiency: document.getElementById('korean-proficiency').value,
      // Added code: commented out education level educationLevel: document.getElementById('education-level').value
    };

    // Convert data to JSON format
    let responseJsonData = JSON.stringify(responseData, null, 2);
    let keystrokeJsonData = JSON.stringify(keystrokeData, null, 2);
    let userInfoJsonData = JSON.stringify(userInfoData, null, 2);

    // Create Blobs containing the JSON data
    let responseBlob = new Blob([responseJsonData], { type: 'application/json' });
    let keystrokeBlob = new Blob([keystrokeJsonData], { type: 'application/json' });
    let userInfoBlob = new Blob([userInfoJsonData], { type: 'application/json' });

    // Create URLs to the Blobs
    let responseUrl = URL.createObjectURL(responseBlob);
    let keystrokeUrl = URL.createObjectURL(keystrokeBlob);
    let userInfoUrl = URL.createObjectURL(userInfoBlob);

    // Create link elements to trigger the downloads
    createDownloadLink(responseBlob, 's1_responses.json');
    createDownloadLink(keystrokeBlob, 's1_keystrokes.json');
    createDownloadLink(userInfoBlob, 's1_user_info.json');

    // Show thank you message with buttons to manually download files if needed
    showThankYouMessage(responseBlob, keystrokeBlob, userInfoBlob);

  } else {
    showAlert('Please complete all questions in the current session.');
  }
}

// Function to calculate the word count
function getWordCount(text) {
  return text.trim().split(/\s+/).filter(word => word.length > 0).length;
}

// Function to show thank you message
function showThankYouMessage(responseBlob, keystrokeBlob, userInfoBlob) {
  let container = document.getElementById('container');
  container.innerHTML = '<h2>Thank you for your participation!</h2>';
  container.innerHTML += '<p>Please email the following JSON files to abb020@bucknell.edu</p>';

  let list = document.createElement('ul');
  list.innerHTML = `
    <li>s1_responses.json</li>
    <li>s1_keystrokes.json</li>
    <li>s1_user_info.json</li>
  `;
  container.appendChild(list);

  // Add buttons to download the files manually
  let buttonContainer = document.createElement('div');
  buttonContainer.className = 'button-container';

  buttonContainer.appendChild(createDownloadButton(responseBlob, 's1_responses.json', 'Download Responses'));
  buttonContainer.appendChild(createDownloadButton(keystrokeBlob, 's1_keystrokes.json', 'Download Keystrokes'));
  buttonContainer.appendChild(createDownloadButton(userInfoBlob, 's1_user_info.json', 'Download Demographics'));

  container.appendChild(buttonContainer);

  // Add visual feedback
  let visualFeedback = document.createElement('div');
  visualFeedback.className = 'feedback';
  visualFeedback.textContent = 'Your responses have been recorded successfully.';
  container.appendChild(visualFeedback);
}

// Function to show alert message
function showAlert(message) {
  let alertDiv = document.querySelector('.alert');
  if (!alertDiv) {
    alertDiv = document.createElement('div');
    alertDiv.className = 'alert';
    document.querySelector('.container').appendChild(alertDiv); // Append alert to the main container
  }
  alertDiv.textContent = message;
  alertDiv.style.display = 'block';
}

// Function to hide alert message
function hideAlert() {
  let alertDiv = document.querySelector('.alert');
  if (alertDiv) {
    alertDiv.style.display = 'none';
  }
}

// Function to hide the language selection dropdown
function hideLanguageSelection() {
  document.getElementById('language-selection').style.display = 'none';
}

// Event listener for the "Participate" button to include hiding the language selection
// Because script.js loads at the end of body in index.html, the element should exist; still attach safely on DOMContentLoaded
function attachParticipateHandler() {
  const participateBtn = document.getElementById('participateButton');
  if (!participateBtn) return;
  participateBtn.addEventListener('click', function() {
    hideLanguageSelection();
    document.getElementById('introduction').style.display = 'none';
    document.getElementById('user-info-form').style.display = 'block';
  });
}

// Event listener when DOM is fully loaded
document.addEventListener('DOMContentLoaded', () => {
  attachParticipateHandler();

  const userInfoForm = document.getElementById('userInfoForm');
  if (userInfoForm) {
    userInfoForm.addEventListener('submit', function(event) {
      event.preventDefault(); // Prevent form submission
      validateUserInfoForm();
    });
  }

  // Initialize input listeners for each input field using event delegation
  initializeEventListeners();
});

// Function to validate user information form
function validateUserInfoForm() {
  let gender = document.querySelector('input[name="gender"]:checked');
  let age = document.getElementById('age').value.trim();
  let handedness = document.querySelector('input[name="handedness"]:checked');
  let errorMessage = '';
  
  if (!gender) {
    errorMessage += 'Gender is required. ';
  }
  
  if (!age) {
    errorMessage += 'Age is required. ';
  } else if (!/^\d+$/.test(age) || parseInt(age) < 5 || parseInt(age) > 80) {
    errorMessage += 'Please enter a valid age between 5 and 80. ';
  }
  
  if (!handedness) {
    errorMessage += 'Handedness is required. ';
  }

  if (errorMessage) {
    displayPopupError(errorMessage);
  } else {
    hidePopupError();
    startSession(); // Proceed to the first session of questions
  }
}

// Function to display popup error message
function displayPopupError(message) {
  let errorPopup = document.getElementById('error-popup');
  if (!errorPopup) {
    errorPopup = document.createElement('div');
    errorPopup.id = 'error-popup';
    errorPopup.className = 'error-popup';
    document.body.appendChild(errorPopup);
  }
  errorPopup.textContent = message;
  errorPopup.style.display = 'block';
}

// Function to hide popup error message
function hidePopupError() {
  let errorPopup = document.getElementById('error-popup');
  if (errorPopup) {
    errorPopup.style.display = 'none';
  }
}

// Function to set language and translate content
function setLanguage(lang) {
  language = 'en';
  translateContent();
  const selection = document.getElementById('language-selection');
  if (selection) selection.style.display = 'none';
}

// Function to translate content based on selected language
function translateContent() {
  const titleEl = document.getElementById('title');
  if (titleEl) titleEl.textContent = 'Keystroke Dynamics Research';

  const introText = document.getElementById('introduction-text');
  if (introText) introText.textContent =
    'Traditional plagiarism detection tools, which primarily rely on direct comparisons between a user’s input and existing sources, often struggle to identify more sophisticated forms of cheating, such as extensive paraphrasing or the use of external assistance, including generative AI or other individuals.';

  const objectiveText = document.getElementById('objective-text');
  if (objectiveText) objectiveText.textContent =
    'Thus, this study aims to address academic dishonesty in writing by analyzing typing patterns and examining the differences in typing dynamics when individuals write directly compared to when they refer to or copy responses from ChatGPT. These differences are characterized by variations in thinking time, typing speed, and the frequency of editing actions during the writing process.';

  const dataCollProcess = document.getElementById('data-collection-process');
  if (dataCollProcess) dataCollProcess.textContent = 'Data Collection Process:';
  const dataCollDesc = document.getElementById('data-collection-description');
  if (dataCollDesc) dataCollDesc.textContent =
    'There are three different sessions for collecting data. In each session, participants will respond to six questions using 100-120 words each, which are designed to invoke various cognitive load levels.';

  const s1desc = document.getElementById('session1-description');
  if (s1desc) s1desc.textContent =
    'In this session, participants need to generate responses to each question independently, without any external assistance.';
  const s2desc = document.getElementById('session2-description');
  if (s2desc) s2desc.textContent =
    'Paraphrasing ChatGPT Session: In this session, participants will feed each question to ChatGPT, then paraphrase the generated response. Paraphrasing is the act of restating a piece of text in your own words while retaining the original meaning.';
  const s3desc = document.getElementById('session3-description');
  if (s3desc) s3desc.textContent =
    'Retyping ChatGPT Session: In this session, participants will feed each prompt to ChatGPT, then retype the generated response, focusing on accurately transcribing the provided answers.';

  const evalCrit = document.getElementById('evaluation-criteria');
  if (evalCrit) evalCrit.textContent = 'Evaluation Criteria:';
  const evalDesc = document.getElementById('evaluation-description');
  if (evalDesc) evalDesc.textContent =
    'Upon submission, participant responses will be evaluated based on several criteria:';
  const gram = document.getElementById('grammatical-accuracy');
  if (gram) gram.textContent = 'Grammatical Accuracy';
  const rel = document.getElementById('relevance');
  if (rel) rel.textContent = 'Relevance';
  const len = document.getElementById('length');
  if (len) len.textContent = 'Length';

  const violationNote = document.getElementById('violation-note');
  if (violationNote) {
    violationNote.textContent =
      'Significant violations of the above could result in a reduced amount of payment for participating in this data collection.';
  }

  const participateBtn = document.getElementById('participateButton');
  if (participateBtn) participateBtn.textContent = 'Proceed to User Information';
  const userInfoTitle = document.getElementById('user-info-title');
  if (userInfoTitle) userInfoTitle.textContent = 'Please provide your information to proceed:';
  const genderLabel = document.getElementById('gender-label');
  if (genderLabel) genderLabel.innerHTML = 'Gender:<span class="required">*</span>';
  const maleLabel = document.getElementById('male-label');
  if (maleLabel) maleLabel.textContent = 'Male';
  const femaleLabel = document.getElementById('female-label');
  if (femaleLabel) femaleLabel.textContent = 'Female';
  const otherLabel = document.getElementById('other-label');
  if (otherLabel) otherLabel.textContent = 'Other';
  const ageLabel = document.getElementById('age-label');
  if (ageLabel) ageLabel.innerHTML = 'Age:<span class="required">*</span>';
  const handednessLabel = document.getElementById('handedness-label');
  if (handednessLabel) handednessLabel.innerHTML = 'Handedness:<span class="required">*</span>';
  const rightLabel = document.getElementById('right-handed-label');
  if (rightLabel) rightLabel.textContent = 'Right-handed';
  const leftLabel = document.getElementById('left-handed-label');
  if (leftLabel) leftLabel.textContent = 'Left-handed';
  const proceedBtn = document.getElementById('proceed-button');
  if (proceedBtn) proceedBtn.textContent = 'Proceed to Questions';
  const errMsg = document.getElementById('error-message');
  if (errMsg) errMsg.textContent = '';
}

// Function to initialize event listeners for input fields using event delegation
function initializeEventListeners() {
  // Attach event listeners to the document
  document.addEventListener('keydown', handleEvent);
  document.addEventListener('keyup', handleEvent);
  document.addEventListener('input', handleEvent);
}

// Event handler function for delegated events
function handleEvent(event) {
  // Check if the event target is an input field with the class 'input'
  if (event.target.classList && event.target.classList.contains('input')) {
    // Call the appropriate function based on the event type
    if (event.type === 'keydown' || event.type === 'keyup') {
      logKeystroke(event);
    } else if (event.type === 'input') {
      // Update word count if the event is 'input'
      let wordCountDiv = event.target.nextElementSibling;
      if (wordCountDiv && wordCountDiv.classList.contains('word-count')) {
        updateWordCount(event.target, wordCountDiv);
      }
    }
  }
}
