# Using This Extension with Local Ollama Model v0.1

This guide explains how to set up and use this VS Code extension with a local Ollama model (version 0.1). Follow these steps to get started:

## 1. Prerequisites

- Visual Studio Code installed
- Node.js and npm installed
- Ollama v0.1 installed locally ([Ollama GitHub](https://github.com/jmorganca/ollama))

## 2. Download and Install Ollama

1. Visit the [Ollama releases page](https://github.com/jmorganca/ollama/releases) and download the installer for your OS.
2. Follow the installation instructions for your platform.

## 3. Download a Model

1. Open a terminal.
2. Run the following command to download a model (e.g., llama2):

   ```sh
   ollama pull llama2
   ```

   Replace `llama2` with your preferred model name if needed.

## 4. Start the Ollama Server

1. In your terminal, start the Ollama server:

   ```sh
   ollama serve
   ```

   By default, Ollama runs at `http://localhost:11434`.

## 5. Configure the Extension

1. Open VS Code and go to the extension settings.
2. Set the Ollama API endpoint to `http://localhost:11434` (if not set by default).
3. Optionally, specify the model name (e.g., `llama2`).

## 6. Use the Extension

- Use the extension commands or UI to interact with the local Ollama model.
- You can now generate completions, chat, or use other AI features provided by the extension.

## Troubleshooting

- Ensure the Ollama server is running and accessible at `http://localhost:11434`.
- Make sure the model is downloaded and available in Ollama.
- Check the extension output/logs for errors.

## More Information

- [Ollama Documentation](https://github.com/jmorganca/ollama)
- [Extension README](./README.md)

---

For questions or issues, please open an issue on the extension's repository.
