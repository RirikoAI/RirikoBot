# AI Command System

This directory contains the implementation of the AI command system for Ririko Bot. The system allows users to chat with various AI services including:

- [Ollama](https://ollama.ai/) (locally hosted or remote)
- [Google AI Studio](https://ai.google.dev/)
- [OpenRouter](https://openrouter.ai/)

## Configuration

The AI service is configured through environment variables in the `.env` file:

```
# AI Service Configuration
# Available options for AI_SERVICE_TYPE: ollama, google_ai, openrouter
AI_SERVICE_TYPE=ollama
# API key for Google AI Studio or OpenRouter (not needed for Ollama)
AI_SERVICE_API_KEY=
# Base URL for the AI service (optional)
# For Ollama, default is http://localhost:11434
# For Google AI, default is https://generativelanguage.googleapis.com/v1beta
# For OpenRouter, default is https://openrouter.ai/api/v1
# For OpenAI, default is https://api.openai.com/v1
AI_SERVICE_BASE_URL=
# Default model to use if not specified
# For Ollama, default is llama3.2:1b
# For Google AI, default is gemini-2.0-flash
# For OpenRouter, default is meta-llama/llama-3.3-8b-instruct:free
# For OpenAI, default is gpt-4.1-nano
AI_SERVICE_DEFAULT_MODEL=llama3.2:1b
```

### Ollama Configuration

To use Ollama (default):

1. Set `AI_SERVICE_TYPE=ollama` in your `.env` file
2. Optionally set `AI_SERVICE_BASE_URL` if your Ollama instance is not running on the default URL
3. Optionally set `AI_SERVICE_DEFAULT_MODEL` to change the default model (default is `llama3.2:1b`)

### Google AI Studio Configuration

To use Google AI Studio:

1. Set `AI_SERVICE_TYPE=google_ai` in your `.env` file
2. Set `AI_SERVICE_API_KEY` to your Google AI API key
3. Optionally set `AI_SERVICE_BASE_URL` if you need to use a different API endpoint
4. Optionally set `AI_SERVICE_DEFAULT_MODEL` to change the default model (default is `gemini-2.0-flash`)

### OpenRouter Configuration

To use OpenRouter:

1. Set `AI_SERVICE_TYPE=openrouter` in your `.env` file
2. Set `AI_SERVICE_API_KEY` to your OpenRouter API key
3. Optionally set `AI_SERVICE_BASE_URL` if you need to use a different API endpoint
4. Optionally set `AI_SERVICE_DEFAULT_MODEL` to change the default model (default is `openai/gpt-3.5-turbo`)

### OpenAI Configuration

To use OpenAI:

1. Set `AI_SERVICE_TYPE=openai` in your `.env` file
2. Set `AI_SERVICE_API_KEY` to your OpenAI API key
3. Optionally set `AI_SERVICE_BASE_URL` if you need to use a different API endpoint
4. Optionally set `AI_SERVICE_DEFAULT_MODEL` to change the default model (default is `gpt-3.5-turbo`)

## Commands

### AI Command

The `/ai` command allows users to chat with the configured AI service.

Usage:
```
/ai <prompt>
```

### AI Model Command

The `/ai-model` command allows users to set and pull AI models.

Usage:
```
/ai-model set <model>  # Set the model to use
/ai-model pull         # Pull/download the model (for Ollama only)
/ai-model pulldefault  # Pull/download the default model (for Ollama only)
/ai-model reset         # Reset the model to default (for Ollama only)
```

Note: For cloud-based services (Google AI, OpenRouter), the `pull` command will simply indicate that the model is ready to use.

## Architecture

The AI command system uses a service-based architecture:

- `AIService` interface defines the common methods for all AI services
- Concrete implementations for each service provider:
  - `OllamaService` for Ollama
  - `GoogleAIService` for Google AI Studio
  - `OpenRouterService` for OpenRouter
- `AIServiceFactory` creates and manages the appropriate service based on configuration

This architecture allows for easy addition of new AI services in the future.