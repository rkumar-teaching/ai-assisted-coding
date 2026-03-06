self.window = self;
self.globalThis = self;

let pyodide = null;
let pyodideReady = false;
let interruptBuffer = null;

async function initializePyodide(buffer) {
  try {
    importScripts('https://cdn.jsdelivr.net/pyodide/v0.24.1/full/pyodide.js');
    pyodide = await loadPyodide({
      indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.24.1/full/'
    });

    if (buffer) {
      interruptBuffer = new Int32Array(buffer);
      pyodide.setInterruptBuffer(interruptBuffer);
    }

    pyodideReady = true;
    self.postMessage({ type: 'ready' });
  } catch (error) {
    self.postMessage({
      type: 'init_error',
      error: error && error.message ? error.message : String(error)
    });
  }
}

async function runPythonCaptureOutput(code) {
  if (!pyodideReady) {
    throw new Error('Pyodide not loaded yet');
  }

  const uid = Date.now().toString();
  const outVar = `_output_${uid}`;

  const wrapped =
    `
import sys, io, traceback
${outVar} = io.StringIO()
_old_stdout = sys.stdout
sys.stdout = ${outVar}
try:
` +
    code
      .split("\n")
      .map(line => "    " + line)
      .join("\n") +
    `
except Exception as e:
    sys.stdout = _old_stdout
    raise e
finally:
    sys.stdout = _old_stdout

${outVar}.getvalue()
`;

  try {
    const result = await pyodide.runPythonAsync(wrapped);
    return String(result || '');
  } catch (pyError) {
    let message = pyError && pyError.message ? pyError.message : String(pyError);
    message = message.replace(/File.*line.*\n?/g, '');
    throw new Error(message.trim());
  }
}

self.onmessage = async (event) => {
  const data = event.data || {};

  if (data.type === 'init') {
    await initializePyodide(data.interruptBuffer || null);
    return;
  }

  if (data.type === 'interrupt') {
    if (interruptBuffer) {
      interruptBuffer[0] = 2;
    }
    return;
  }

  if (data.type === 'run') {
    try {
      if (interruptBuffer) {
        interruptBuffer[0] = 0;
      }
      const output = await runPythonCaptureOutput(data.code || '');
      self.postMessage({ type: 'result', id: data.id, output });
    } catch (error) {
      self.postMessage({
        type: 'error',
        id: data.id,
        error: error && error.message ? error.message : String(error)
      });
    }
  }
};
